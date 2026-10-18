create table if not exists public.retex_responses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    pseudo text check (pseudo is null or char_length(pseudo) <= 120),
    specialty text check (specialty is null or char_length(specialty) <= 120),
    themes text[] not null default '{}' check (cardinality(themes) <= 6),
    navigation text check (navigation is null or char_length(navigation) <= 200),
    design text check (design is null or char_length(design) <= 200),
    best_mode text check (best_mode is null or char_length(best_mode) <= 200),
    scoring_opinion text check (scoring_opinion is null or char_length(scoring_opinion) <= 200),
    used_report_form text check (used_report_form is null or char_length(used_report_form) <= 200),
    recommendation text check (recommendation is null or char_length(recommendation) <= 200),
    comment text check (comment is null or char_length(comment) <= 2000),
    created_at timestamptz not null default now()
);

create index if not exists retex_responses_created_at_idx on public.retex_responses (created_at desc);

-- Un seul RETEX par compte ; les doublons éventuels les plus récents sont supprimés avant l'index.
delete from public.retex_responses r
using public.retex_responses older
where r.user_id = older.user_id
  and (older.created_at, older.id) < (r.created_at, r.id);

create unique index if not exists retex_responses_user_id_key on public.retex_responses (user_id);

alter table public.retex_responses enable row level security;

grant select, insert on public.retex_responses to authenticated;

drop policy if exists "Candidates can submit retex responses" on public.retex_responses;
create policy "Candidates can submit retex responses"
on public.retex_responses
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Candidates can read own retex responses" on public.retex_responses;
create policy "Candidates can read own retex responses"
on public.retex_responses
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read retex responses" on public.retex_responses;
create policy "Admins can read retex responses"
on public.retex_responses
for select
to authenticated
using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = 'true'
    or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') = '1'
);
