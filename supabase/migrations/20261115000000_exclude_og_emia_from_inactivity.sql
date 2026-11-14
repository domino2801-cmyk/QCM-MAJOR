begin;

create or replace function public.claim_qcm_inactivity_email()
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
      and not ((u.raw_app_meta_data ->> 'specialty') in ('OG', 'EMIA'))
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

create or replace function public.confirm_qcm_inactivity_email(p_id uuid)
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
          and not ((u.raw_app_meta_data ->> 'specialty') in ('OG', 'EMIA'))
    ) then return true; end if;
    update public.qcm_inactivity_emails set status = 'cancelled'
    where id = p_id and status = 'sending';
    return false;
end;
$$;

notify pgrst, 'reload schema';
commit;
