alter table public.profiles enable row level security;
alter table public.quiz_results enable row level security;
alter table public.question_bank enable row level security;

drop policy if exists "Autoriser Insertion publique" on public.profiles;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);

drop policy if exists "Admins can read all quiz results" on public.quiz_results;
drop policy if exists "Admins can manage all quiz results" on public.quiz_results;
create policy "Admins can manage all quiz results"
on public.quiz_results
for all
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
)
with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);

do $$
declare
    candidate_condition text;
begin
    select string_agg(
        format('(%I)::text = (auth.uid())::text', column_name),
        ' or '
        order by case column_name when 'candidate_id' then 1 else 2 end
    )
    into candidate_condition
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quiz_results'
      and column_name in ('candidate_id', 'user_id');

    if candidate_condition is null then
        raise exception 'quiz_results must contain candidate_id or user_id';
    end if;

    execute 'drop policy if exists "Users can read own quiz results" on public.quiz_results';
    execute 'drop policy if exists "Users can create own quiz results" on public.quiz_results';
    execute 'drop policy if exists "Users can update own quiz results" on public.quiz_results';
    execute 'drop policy if exists "Users can delete own quiz results" on public.quiz_results';

    execute format(
        'create policy "Users can read own quiz results" on public.quiz_results for select to authenticated using (%s)',
        candidate_condition
    );
    execute format(
        'create policy "Users can create own quiz results" on public.quiz_results for insert to authenticated with check (%s)',
        candidate_condition
    );
    execute format(
        'create policy "Users can update own quiz results" on public.quiz_results for update to authenticated using (%s) with check (%s)',
        candidate_condition,
        candidate_condition
    );
    execute format(
        'create policy "Users can delete own quiz results" on public.quiz_results for delete to authenticated using (%s)',
        candidate_condition
    );
end $$;

drop policy if exists "Anyone can read active questions" on public.question_bank;
create policy "Anyone can read active questions"
on public.question_bank
for select
to anon, authenticated
using (active = true);

drop policy if exists "Admins can manage all questions" on public.question_bank;
create policy "Admins can manage all questions"
on public.question_bank
for all
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
)
with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);
