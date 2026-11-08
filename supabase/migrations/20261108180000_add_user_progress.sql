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

commit;
