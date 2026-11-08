create table public.account_blocks (
    user_id uuid primary key references auth.users(id) on delete cascade,
    blocked_at timestamptz not null default now()
);

alter table public.account_blocks enable row level security;
revoke all on table public.account_blocks from public, anon, authenticated;

create or replace function public.is_current_account_blocked()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    return exists (
        select 1
        from public.account_blocks as blocked
        where blocked.user_id = auth.uid()
    );
end;
$$;

revoke all on function public.is_current_account_blocked() from public, anon;
grant execute on function public.is_current_account_blocked() to authenticated;

create or replace function public.get_admin_blocked_accounts()
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required'
            using errcode = '42501';
    end if;

    return query
    select blocked.user_id
    from public.account_blocks as blocked
    order by blocked.user_id;
end;
$$;

revoke all on function public.get_admin_blocked_accounts() from public, anon;
grant execute on function public.get_admin_blocked_accounts() to authenticated;

create or replace function public.set_account_blocked(p_user_id uuid, p_blocked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required'
            using errcode = '42501';
    end if;

    if p_user_id is null or p_blocked is null then
        raise exception 'A user and block status are required';
    end if;

    if exists (
        select 1
        from auth.users as account
        where account.id = p_user_id
          and coalesce(
              (account.raw_app_meta_data ->> 'role') = 'admin'
              or (account.raw_app_meta_data ->> 'bm4_admin') in ('true', '1'),
              false
          )
    ) then
        raise exception 'Administrator accounts cannot be blocked';
    end if;

    if p_blocked then
        insert into public.account_blocks (user_id)
        values (p_user_id)
        on conflict (user_id) do nothing;
    else
        delete from public.account_blocks
        where user_id = p_user_id;
    end if;

    return p_blocked;
end;
$$;

revoke all on function public.set_account_blocked(uuid, boolean) from public, anon;
grant execute on function public.set_account_blocked(uuid, boolean) to authenticated;
