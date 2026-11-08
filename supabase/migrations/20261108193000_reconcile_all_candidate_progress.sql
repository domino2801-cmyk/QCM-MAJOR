begin;

do $$
declare
    candidate record;
    previous_sub text := current_setting('request.jwt.claim.sub', true);
    previous_claims text := current_setting('request.jwt.claims', true);
begin
    for candidate in
        select u.id
        from auth.users u
        where exists (
            select 1
            from public.quiz_results r
            where coalesce(to_jsonb(r) ->> 'user_id', to_jsonb(r) ->> 'candidate_id') = u.id::text
        )
    loop
        perform set_config('request.jwt.claim.sub', candidate.id::text, true);
        perform set_config(
            'request.jwt.claims',
            json_build_object('sub', candidate.id, 'role', 'authenticated')::text,
            true
        );
        perform public.reconcile_user_progress_from_results();
    end loop;

    perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
end;
$$;

commit;
