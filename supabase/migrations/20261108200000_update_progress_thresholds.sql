begin;

create or replace function public.reconcile_user_progress_from_results()
returns public.user_progress
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    progress public.user_progress;
    score_10 integer;
    score_20 integer;
    score_30 integer;
    score_40 integer;
    score_50 integer;
    completed_50 boolean;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    insert into public.user_progress (user_id) values (auth.uid())
        on conflict (user_id) do nothing;

    with result_records as (
        select to_jsonb(result) as data
        from public.quiz_results result
        where coalesce(to_jsonb(result) ->> 'user_id', to_jsonb(result) ->> 'candidate_id') = auth.uid()::text
    ),
    valid_results as (
        select
            (data ->> 'total')::integer as total,
            (data ->> 'correct')::integer * 4 - (data ->> 'wrong')::integer as points
        from result_records
        where data ->> 'total' ~ '^(10|20|30|40|50)$'
          and coalesce(data ->> 'correct', '') ~ '^[0-9]+$'
          and coalesce(data ->> 'wrong', '') ~ '^[0-9]+$'
          and (data ->> 'correct')::integer <= (data ->> 'total')::integer
          and (data ->> 'wrong')::integer <= (data ->> 'total')::integer
          and (data ->> 'correct')::integer + (data ->> 'wrong')::integer <= (data ->> 'total')::integer
    )
    select
        max(points) filter (where total = 10),
        max(points) filter (where total = 20),
        max(points) filter (where total = 30),
        max(points) filter (where total = 40),
        max(points) filter (where total = 50),
        exists (select 1 from result_records where data ->> 'total' = '50')
    into score_10, score_20, score_30, score_40, score_50, completed_50
    from valid_results;

    update public.user_progress
    set high_score_10 = greatest(high_score_10, score_10),
        high_score_20 = greatest(high_score_20, score_20),
        high_score_30 = greatest(high_score_30, score_30),
        high_score_40 = greatest(high_score_40, score_40),
        high_score_50 = greatest(high_score_50, score_50),
        max_unlocked_questions = greatest(
            max_unlocked_questions,
            case when greatest(high_score_10, score_10) >= 24 then 20 else 10 end,
            case when greatest(high_score_20, score_20) >= 52 then 30 else 10 end,
            case when greatest(high_score_30, score_30) >= 84 then 40 else 10 end,
            case when greatest(high_score_40, score_40) >= 120 or completed_50 then 50 else 10 end
        )
    where user_id = auth.uid()
    returning * into strict progress;

    return progress;
end;
$$;

create or replace function public.record_user_progress(question_count integer, points integer)
returns public.user_progress
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    progress public.user_progress;
    threshold integer;
begin
    if auth.uid() is null or question_count is null or question_count not in (10, 20, 30, 40, 50)
        or points is null or points < -question_count or points > 4 * question_count then
        raise exception 'Invalid progress result';
    end if;

    perform public.reconcile_user_progress_from_results();

    select * into strict progress from public.user_progress
        where user_id = auth.uid() for update;
    if question_count > progress.max_unlocked_questions then
        raise exception 'Question level is locked';
    end if;

    threshold := case question_count when 10 then 24 when 20 then 52
        when 30 then 84 when 40 then 120 else null end;
    execute format(
        'update public.user_progress set high_score_%1$s = greatest(coalesce(high_score_%1$s, $1), $1),
         max_unlocked_questions = greatest(max_unlocked_questions, $2)
         where user_id = $3 returning *', question_count
    ) into progress using points,
        case when threshold is not null and points >= threshold then question_count + 10 else 10 end,
        auth.uid();
    return progress;
end;
$$;

do $$
declare
    candidate record;
    previous_sub text := current_setting('request.jwt.claim.sub', true);
    previous_claims text := current_setting('request.jwt.claims', true);
begin
    for candidate in
        select u.id from auth.users u
        where exists (select 1 from public.user_progress p where p.user_id = u.id)
           or exists (
               select 1 from public.quiz_results r
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

notify pgrst, 'reload schema';
commit;
