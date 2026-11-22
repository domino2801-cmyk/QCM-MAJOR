begin;

-- Synthèse des validations des 7 modules DOCTRINE, réservée aux administrateurs.
create or replace function public.get_admin_candidate_module_progress()
returns jsonb
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
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'user_id', summary.user_id,
            'completed_modules', to_jsonb(summary.completed_modules),
            'started_modules', to_jsonb(summary.started_modules),
            'last_activity', summary.last_activity
        ) order by summary.last_activity desc)
        from (
            select
                events.user_id,
                coalesce(
                    array_agg(distinct events.module_id order by events.module_id)
                        filter (where events.event_type = 'module_completed'),
                    array[]::text[]
                ) as completed_modules,
                coalesce(
                    array_agg(distinct events.module_id order by events.module_id)
                        filter (where events.event_type = 'module_started'),
                    array[]::text[]
                ) as started_modules,
                max(events.created_at) as last_activity
            from public.doctrine_progress_events as events
            group by events.user_id
        ) as summary
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_candidate_module_progress() from public, anon;
grant execute on function public.get_admin_candidate_module_progress() to authenticated;

notify pgrst, 'reload schema';
commit;
