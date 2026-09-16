-- QCM-MAJOR: préparation Supabase pour campagne de tests manuels complète
-- À exécuter dans l'éditeur SQL Supabase (projet de test dédié)
-- Portée: script prévu pour une base de test dédiée/isolée.
-- Pour une base legacy partagée, préférer des migrations explicites avant usage.
-- Exécution attendue: rôle privilégié via SQL Editor (lecture `auth.users` requise).

begin;

create extension if not exists pgcrypto;

-- 1) Tables
create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  name text not null,
  specialty text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  theme_id integer not null check (theme_id between 0 and 4),
  q text not null,
  r jsonb not null,
  correct integer not null check (correct between 0 and 3),
  constraint questions_answers_shape_check check (
    jsonb_typeof(r) = 'array'
    and jsonb_array_length(r) = 4
  ),
  campaign_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_results (
  id text primary key,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  email text,
  name text,
  theme text not null,
  score numeric(5,2) not null,
  correct integer not null default 0,
  wrong integer not null default 0,
  skipped integer not null default 0,
  total integer not null default 0,
  date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Trigger updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_questions_updated_at on public.questions;
create trigger trg_questions_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

drop trigger if exists trg_quiz_results_updated_at on public.quiz_results;
create trigger trg_quiz_results_updated_at
before update on public.quiz_results
for each row execute function public.set_updated_at();

-- 3) RLS
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_results enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  -- Contrat admin accepté:
  -- - claim racine `role = admin`
  -- - ou `app_metadata.role = admin`
  -- - ou `app_metadata.bm4_admin = true` (préféré pour ce projet)
  select coalesce(auth.jwt() ->> 'role', '') = 'admin'
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
     or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'bm4_admin', 'false')) = 'true';
$$;

-- Supprime les anciennes policies pour relancer le script sans conflit

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

drop policy if exists questions_select_authenticated on public.questions;
drop policy if exists questions_manage_admin on public.questions;

drop policy if exists quiz_results_select_own_or_admin on public.quiz_results;
drop policy if exists quiz_results_insert_own_or_admin on public.quiz_results;
drop policy if exists quiz_results_update_own_or_admin on public.quiz_results;
drop policy if exists quiz_results_delete_own_or_admin on public.quiz_results;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (public.is_app_admin() or id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (public.is_app_admin() or id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (public.is_app_admin() or id = auth.uid())
with check (public.is_app_admin() or id = auth.uid());

create policy questions_select_authenticated
on public.questions
for select
to authenticated
using (true);

create policy questions_manage_admin
on public.questions
for all
to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy quiz_results_select_own_or_admin
on public.quiz_results
for select
to authenticated
using (public.is_app_admin() or candidate_id = auth.uid());

create policy quiz_results_insert_own_or_admin
on public.quiz_results
for insert
to authenticated
with check (public.is_app_admin() or candidate_id = auth.uid());

create policy quiz_results_update_own_or_admin
on public.quiz_results
for update
to authenticated
using (public.is_app_admin() or candidate_id = auth.uid())
with check (public.is_app_admin() or candidate_id = auth.uid());

create policy quiz_results_delete_own_or_admin
on public.quiz_results
for delete
to authenticated
using (public.is_app_admin() or candidate_id = auth.uid());

-- 4) Préparation données de test
-- Nettoyage ciblé et idempotent: uniquement les données liées aux comptes de test
delete from public.quiz_results
where candidate_id in (
  select id from public.profiles where email in (
    'candidat-ok@qcm-major.test',
    'candidat-pending@qcm-major.test',
    'admin-ok@qcm-major.test',
    'user-noadmin@qcm-major.test'
  )
);

-- Questions minimales multi-thèmes + 2 doublons volontaires pour le test "cleanup"
delete from public.questions where campaign_tag = 'manual_test';

insert into public.profiles (id, email, name, specialty)
select
  u.id,
  u.email,
  case u.email
    when 'candidat-ok@qcm-major.test' then 'TEST_CANDIDAT_OK'
    when 'candidat-pending@qcm-major.test' then 'TEST_CANDIDAT_PENDING'
    when 'admin-ok@qcm-major.test' then 'TEST_ADMIN_OK'
    when 'user-noadmin@qcm-major.test' then 'TEST_USER_NOADMIN'
    else 'TEST_USER'
  end,
  'INF'
from auth.users u
where u.email in (
  'candidat-ok@qcm-major.test',
  'candidat-pending@qcm-major.test',
  'admin-ok@qcm-major.test',
  'user-noadmin@qcm-major.test'
)
on conflict (id) do update
set
  email = excluded.email,
  name = excluded.name,
  specialty = excluded.specialty,
  updated_at = now();

insert into public.questions (id, theme_id, q, r, correct, campaign_tag) values
  ('seed-1', 0, 'Quel est le rôle principal du chef de section ?', '["Commander", "Coder", "Dessiner", "Négocier"]'::jsonb, 0, 'manual_test'),
  ('seed-2', 1, 'Quelle arme équipe prioritairement l''infanterie mécanisée ?', '["Canon 20mm", "FAMAS/HK416", "Missile balistique", "Torpille"]'::jsonb, 1, 'manual_test'),
  ('seed-3', 2, 'Que définit une LPM ?', '["Un grade", "La programmation des moyens", "Une doctrine OTAN", "Un exercice"]'::jsonb, 1, 'manual_test'),
  ('seed-4', 3, 'Une OPEX est menée :', '["Uniquement en métropole", "Hors du territoire national", "En école", "En simulation"]'::jsonb, 1, 'manual_test'),
  ('seed-5', 4, 'La tradition régimentaire sert à :', '["Ignorer l''histoire", "Renforcer la cohésion", "Supprimer le commandement", "Éviter l''instruction"]'::jsonb, 1, 'manual_test'),
  ('seed-dup-a', 0, 'Quel est le rôle principal du chef de section ?', '["Commander", "Coder", "Dessiner", "Négocier"]'::jsonb, 0, 'manual_test'),
  ('seed-dup-b', 0, '  Quel   est le rôle principal du chef de section ?  ', '["Commander", "Coder", "Dessiner", "Négocier"]'::jsonb, 0, 'manual_test')
on conflict (id) do update
set
  theme_id = excluded.theme_id,
  q = excluded.q,
  r = excluded.r,
  correct = excluded.correct,
  campaign_tag = excluded.campaign_tag,
  updated_at = now();

alter table public.profiles force row level security;
alter table public.questions force row level security;
alter table public.quiz_results force row level security;

commit;

-- 5) Comptes de test (à créer dans Supabase Auth > Users)
-- - candidat-ok@qcm-major.test       (OTP validé)
-- - candidat-pending@qcm-major.test  (inscription non validée OTP)
-- - admin-ok@qcm-major.test          (claim app_metadata.bm4_admin=true OU role=admin)
-- - user-noadmin@qcm-major.test      (authentifié sans claim admin)
--
-- Pour admin, exemple de app_metadata JSON:
-- { "bm4_admin": true }
