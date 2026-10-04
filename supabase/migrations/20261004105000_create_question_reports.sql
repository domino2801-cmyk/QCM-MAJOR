create table if not exists public.question_reports (
    id uuid primary key default gen_random_uuid(),
    question_id text,
    question_text text not null check (char_length(question_text) between 1 and 2000),
    answers jsonb not null check (jsonb_typeof(answers) = 'array'),
    correct_answer_index integer not null check (correct_answer_index between 0 and 3),
    quiz_theme text not null,
    details text check (details is null or char_length(details) <= 1000),
    reporter_id uuid references auth.users(id) on delete set null,
    status text not null default 'pending' check (status in ('pending', 'resolved')),
    created_at timestamptz not null default now()
);

alter table public.question_reports enable row level security;

grant select, insert, update on public.question_reports to authenticated;

drop policy if exists "Candidates can submit question reports" on public.question_reports;
create policy "Candidates can submit question reports"
on public.question_reports
for insert
to authenticated
with check (
    reporter_id = auth.uid()
    and status = 'pending'
);

drop policy if exists "Admins can read question reports" on public.question_reports;
create policy "Admins can read question reports"
on public.question_reports
for select
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);

drop policy if exists "Admins can update question reports" on public.question_reports;
create policy "Admins can update question reports"
on public.question_reports
for update
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
