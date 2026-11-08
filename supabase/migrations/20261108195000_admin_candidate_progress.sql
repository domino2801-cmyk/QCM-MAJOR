begin;

create function public.get_admin_candidate_progress(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    unlocked integer;
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Candidate not found' using errcode = '22023';
    end if;

    select max_unlocked_questions into unlocked
    from public.user_progress
    where user_id = p_user_id;

    return coalesce(unlocked, 10);
end;
$$;

revoke all on function public.get_admin_candidate_progress(uuid) from public, anon;
grant execute on function public.get_admin_candidate_progress(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
