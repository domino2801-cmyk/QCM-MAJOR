begin;

create function public.get_admin_current_inactivity_reminders()
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
        select jsonb_agg(a.user_id)
        from public.qcm_candidate_activity a
        join public.qcm_inactivity_emails m
            on m.user_id = a.user_id and m.activity_at = a.last_seen_at
        where m.status = 'sent'
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_current_inactivity_reminders() from public, anon;
grant execute on function public.get_admin_current_inactivity_reminders() to authenticated;

notify pgrst, 'reload schema';
commit;
