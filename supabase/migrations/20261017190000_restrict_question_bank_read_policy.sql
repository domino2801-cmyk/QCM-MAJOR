alter table public.question_bank enable row level security;

drop policy if exists "Lecture des questions" on public.question_bank;
drop policy if exists "Public can read question bank" on public.question_bank;
drop policy if exists "Anyone can read question bank" on public.question_bank;
drop policy if exists "Anyone can read active questions" on public.question_bank;

create policy "Anyone can read active questions"
on public.question_bank
for select
to anon, authenticated
using (active is true);
