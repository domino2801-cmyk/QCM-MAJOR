begin;

create or replace function public.get_admin_candidate_overview()
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
        with accounts as (
            select
                users.id as user_id,
                users.email,
                coalesce(
                    nullif(to_jsonb(profiles) ->> 'name', ''),
                    nullif(split_part(users.email, '@', 1), ''),
                    'Candidat'
                ) as name,
                coalesce(
                    nullif(to_jsonb(profiles) ->> 'speciality', ''),
                    nullif(to_jsonb(profiles) ->> 'specialty', '')
                ) as specialty
            from public.profiles as profiles
            join auth.users as users on users.id = profiles.id
            where not coalesce((
                (users.raw_app_meta_data ->> 'role') = 'admin'
                or (users.raw_app_meta_data ->> 'bm4_admin') in ('true', '1')
            ), false)
        ),
        qcm_activity as (
            select activity.user_id, max(activity.created_at) as last_activity
            from (
                select
                    coalesce(to_jsonb(results) ->> 'user_id', to_jsonb(results) ->> 'candidate_id') as user_id,
                    nullif(to_jsonb(results) ->> 'created_at', '')::timestamptz as created_at
                from public.quiz_results as results
                union all
                select reports.reporter_id::text, reports.created_at
                from public.question_reports as reports
                where reports.reporter_id is not null
                union all
                select responses.user_id::text, responses.created_at
                from public.retex_responses as responses
            ) as activity
            where activity.user_id is not null and activity.created_at is not null
            group by activity.user_id
        ),
        doctrine_activity as (
            select activity.user_id, max(activity.created_at) as last_activity
            from (
                select events.user_id, events.created_at from public.doctrine_progress_events as events
                union all
                select views.user_id, views.opened_at from public.doctrine_document_views as views
                union all
                select submissions.user_id, submissions.created_at from public.doctrine_fiche_submissions as submissions
                union all
                select reports.user_id, reports.created_at from public.doctrine_signalements as reports
            ) as activity
            group by activity.user_id
        ),
        latest_doctrine_step as (
            select distinct on (events.user_id)
                events.user_id, events.module_id, events.event_type, events.dossier
            from public.doctrine_progress_events as events
            order by events.user_id, events.created_at desc, events.id desc
        ),
        completed_modules as (
            select
                events.user_id,
                array_agg(distinct events.module_id order by events.module_id)
                    filter (where events.event_type = 'module_completed') as module_ids
            from public.doctrine_progress_events as events
            group by events.user_id
        )
        select jsonb_agg(jsonb_build_object(
            'user_id', accounts.user_id,
            'name', accounts.name,
            'email', accounts.email,
            'specialty', accounts.specialty,
            'qcm_last_activity', qcm_activity.last_activity,
            'doctrine_last_activity', doctrine_activity.last_activity,
            'last_activity', greatest(qcm_activity.last_activity, doctrine_activity.last_activity),
            'doctrine_module_id', latest_doctrine_step.module_id,
            'doctrine_event_type', latest_doctrine_step.event_type,
            'doctrine_dossier', latest_doctrine_step.dossier,
            'doctrine_completed_modules', coalesce(to_jsonb(completed_modules.module_ids), '[]'::jsonb),
            'qcm_max_unlocked_questions', progress.max_unlocked_questions
        ) order by accounts.name, accounts.user_id)
        from accounts
        left join qcm_activity on qcm_activity.user_id = accounts.user_id::text
        left join doctrine_activity on doctrine_activity.user_id = accounts.user_id
        left join latest_doctrine_step on latest_doctrine_step.user_id = accounts.user_id
        left join completed_modules on completed_modules.user_id = accounts.user_id
        left join public.user_progress as progress on progress.user_id = accounts.user_id
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_candidate_overview() from public, anon;
grant execute on function public.get_admin_candidate_overview() to authenticated;

notify pgrst, 'reload schema';
commit;
