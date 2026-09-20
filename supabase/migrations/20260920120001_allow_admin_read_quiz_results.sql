drop policy if exists "Admins can read all quiz results" on public.quiz_results;

create policy "Admins can read all quiz results"
on public.quiz_results
for select
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);
