begin;

create table public.qcm_candidate_activity (
    user_id uuid primary key references auth.users(id) on delete cascade,
    last_seen_at timestamptz not null default now()
);

create table public.qcm_inactivity_emails (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    activity_at timestamptz not null,
    recipient text not null,
    status text not null check (status in ('sending', 'sent', 'failed', 'unknown', 'cancelled')),
    attempted_at timestamptz not null default now(),
    sent_at timestamptz,
    resend_id text,
    error text,
    unique (user_id, activity_at)
);

alter table public.qcm_candidate_activity enable row level security;
alter table public.qcm_inactivity_emails enable row level security;
revoke all on public.qcm_candidate_activity, public.qcm_inactivity_emails from public, anon, authenticated;

insert into public.qcm_candidate_activity (user_id)
select u.id
from auth.users u
where exists (
    select 1 from public.quiz_results r
    where coalesce(to_jsonb(r) ->> 'user_id', to_jsonb(r) ->> 'candidate_id') = u.id::text
);

create function public.record_qcm_visit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    insert into public.qcm_candidate_activity (user_id, last_seen_at)
    values (auth.uid(), now())
    on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke all on function public.record_qcm_visit() from public, anon;
grant execute on function public.record_qcm_visit() to authenticated;

create function public.claim_qcm_inactivity_email()
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    candidate record;
begin
    select a.user_id, a.last_seen_at, u.email into candidate
    from public.qcm_candidate_activity a
    join auth.users u on u.id = a.user_id
    left join public.qcm_inactivity_emails m
        on m.user_id = a.user_id and m.activity_at = a.last_seen_at
    where a.last_seen_at <= now() - interval '15 days'
      and u.email is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and lower(trim(u.email)) <> 'admin@admin.fr'
      and not coalesce((u.raw_app_meta_data ->> 'role') = 'admin'
          or (u.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'), false)
      and not exists (select 1 from public.account_blocks b where b.user_id = u.id)
      and (m.id is null or (m.status = 'failed' and m.attempted_at <= now() - interval '1 hour'))
    order by a.last_seen_at
    for update of a skip locked
    limit 1;
    if not found then return; end if;

    return query
    insert into public.qcm_inactivity_emails as m (user_id, activity_at, recipient, status)
    values (candidate.user_id, candidate.last_seen_at, candidate.email, 'sending')
    on conflict (user_id, activity_at) do update
        set status = 'sending', attempted_at = now(), recipient = excluded.recipient, error = null
        where m.status = 'failed'
    returning m.id, m.recipient;
end;
$$;
revoke all on function public.claim_qcm_inactivity_email() from public, anon, authenticated;
grant execute on function public.claim_qcm_inactivity_email() to service_role;

create function public.confirm_qcm_inactivity_email(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1 from public.qcm_inactivity_emails m
        join public.qcm_candidate_activity a on a.user_id = m.user_id
        join auth.users u on u.id = m.user_id
        where m.id = p_id and m.status = 'sending'
          and a.last_seen_at = m.activity_at and a.last_seen_at <= now() - interval '15 days'
          and u.email = m.recipient and u.email_confirmed_at is not null
          and (u.banned_until is null or u.banned_until <= now())
          and lower(trim(u.email)) <> 'admin@admin.fr'
          and not coalesce((u.raw_app_meta_data ->> 'role') = 'admin'
              or (u.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'), false)
          and not exists (select 1 from public.account_blocks b where b.user_id = u.id)
    ) then return true; end if;
    update public.qcm_inactivity_emails set status = 'cancelled'
    where id = p_id and status = 'sending';
    return false;
end;
$$;
revoke all on function public.confirm_qcm_inactivity_email(uuid) from public, anon, authenticated;
grant execute on function public.confirm_qcm_inactivity_email(uuid) to service_role;

create function public.finish_qcm_inactivity_email(p_id uuid, p_status text, p_resend_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_status not in ('sent', 'failed', 'unknown') then
        raise exception 'Invalid email status';
    end if;
    update public.qcm_inactivity_emails
    set status = p_status, resend_id = p_resend_id,
        error = left(p_error, 300),
        sent_at = case when p_status = 'sent' then now() else null end
    where id = p_id and status = 'sending';
    if not found then raise exception 'Email reservation not found'; end if;
end;
$$;
revoke all on function public.finish_qcm_inactivity_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_qcm_inactivity_email(uuid, text, text, text) to service_role;

create function public.get_admin_inactivity_emails(p_user_id uuid, p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1'), false
    ) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'status', m.status, 'attempted_at', m.attempted_at,
            'sent_at', m.sent_at, 'error', m.error
        ) order by m.attempted_at desc)
        from public.qcm_inactivity_emails m
        where m.user_id = p_user_id and (p_since is null or m.attempted_at >= p_since)
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_inactivity_emails(uuid, timestamptz) from public, anon;
grant execute on function public.get_admin_inactivity_emails(uuid, timestamptz) to authenticated;

alter function public.get_admin_candidate_tracking(uuid, timestamptz)
    rename to get_admin_candidate_tracking_before_inactivity;
create function public.get_admin_candidate_tracking(p_user_id uuid, p_since timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select public.get_admin_candidate_tracking_before_inactivity(p_user_id, p_since)
        || jsonb_build_object('inactivity_emails', public.get_admin_inactivity_emails(p_user_id, p_since));
$$;
revoke all on function public.get_admin_candidate_tracking(uuid, timestamptz) from public, anon;
grant execute on function public.get_admin_candidate_tracking(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
