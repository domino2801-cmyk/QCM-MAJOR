begin;

create or replace function public.get_admin_candidate_tracking(
    p_user_id uuid,
    p_since timestamptz default null
)
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

    if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Candidate not found' using errcode = '22023';
    end if;

    return jsonb_build_object(
        'progress',
        coalesce((
            select jsonb_build_object(
                'max_unlocked_questions', progress.max_unlocked_questions,
                'high_score_10', progress.high_score_10,
                'high_score_20', progress.high_score_20,
                'high_score_30', progress.high_score_30,
                'high_score_40', progress.high_score_40,
                'high_score_50', progress.high_score_50
            )
            from public.user_progress as progress
            where progress.user_id = p_user_id
        ), jsonb_build_object('max_unlocked_questions', 10)),
        'progress_events',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'event_type', events.event_type,
                'module_id', events.module_id,
                'dossier', events.dossier,
                'created_at', events.created_at
            ) order by events.created_at desc)
            from public.doctrine_progress_events as events
            where events.user_id = p_user_id
              and (p_since is null or events.created_at >= p_since)
        ), '[]'::jsonb),
        'documents',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'document_title', views.document_title,
                'module_id', views.module_id,
                'event_type', views.event_type,
                'opened_at', views.opened_at
            ) order by views.opened_at desc)
            from public.doctrine_document_views as views
            where views.user_id = p_user_id
              and (p_since is null or views.opened_at >= p_since)
        ), '[]'::jsonb),
        'submissions',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'dossier', submissions.dossier,
                'created_at', submissions.created_at
            ) order by submissions.created_at desc)
            from public.doctrine_fiche_submissions as submissions
            where submissions.user_id = p_user_id
              and (p_since is null or submissions.created_at >= p_since)
        ), '[]'::jsonb),
        'signalements',
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'incident_type', reports.incident_type,
                'module_id', reports.module_id,
                'resource', reports.resource,
                'priority', reports.priority,
                'status', reports.status,
                'created_at', reports.created_at
            ) order by reports.created_at desc)
            from public.doctrine_signalements as reports
            where reports.user_id = p_user_id
              and (p_since is null or reports.created_at >= p_since)
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.get_admin_candidate_tracking(uuid, timestamptz) from public, anon;
grant execute on function public.get_admin_candidate_tracking(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
