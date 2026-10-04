grant delete on public.question_reports to authenticated;

drop policy if exists "Admins can delete question reports" on public.question_reports;
create policy "Admins can delete question reports"
on public.question_reports
for delete
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);
