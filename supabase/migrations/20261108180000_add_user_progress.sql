begin;

create table public.user_progress (
    user_id uuid primary key references auth.users (id) on delete cascade,
    max_unlocked_questions integer not null default 10
        check (max_unlocked_questions in (10, 20, 30, 40, 50)),
    high_score_10 integer check (high_score_10 between -10 and 40),
    high_score_20 integer check (high_score_20 between -20 and 80),
    high_score_30 integer check (high_score_30 between -30 and 120),
    high_score_40 integer check (high_score_40 between -40 and 160),
    high_score_50 integer check (high_score_50 between -50 and 200)
);

alter table public.user_progress enable row level security;
revoke all on public.user_progress from anon, authenticated;
grant select, insert, update on public.user_progress to authenticated;

create policy "Users can read own progress"
    on public.user_progress for select to authenticated
    using ((select auth.uid()) = user_id);
create policy "Users can create own progress"
    on public.user_progress for insert to authenticated
    with check ((select auth.uid()) = user_id);
create policy "Users can update own progress"
    on public.user_progress for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create function public.record_user_progress(question_count integer, points integer)
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

    insert into public.user_progress (user_id) values (auth.uid())
        on conflict (user_id) do nothing;
    select * into strict progress from public.user_progress
        where user_id = auth.uid() for update;
    if question_count > progress.max_unlocked_questions then
        raise exception 'Question level is locked';
    end if;

    threshold := case question_count when 10 then 24 when 20 then 56
        when 30 then 96 when 40 then 136 else null end;
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

revoke all on function public.record_user_progress(integer, integer) from public, anon;
grant execute on function public.record_user_progress(integer, integer) to authenticated;

commit;
