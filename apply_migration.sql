-- ============================================================================
-- MIGRATION: Update Specialty Function with Retex
-- 
-- Exécutez ce script dans Supabase SQL Editor pour appliquer la migration
-- Date: 2026-11-14
-- ============================================================================

begin;

-- Améliorer la fonction update_candidate_specialty pour mettre à jour aussi les tables connexes
create or replace function public.update_candidate_specialty(
    p_user_id uuid,
    p_new_specialty text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_updated_data jsonb;
    v_profiles_count int;
    v_retex_count int;
begin
    if p_user_id is null or p_new_specialty is null then
        raise exception 'User ID and specialty are required';
    end if;

    if not coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1'), false
    ) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'User not found';
    end if;

    -- Mettre à jour la spécialité dans auth.users
    update auth.users
    set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{specialty}',
        to_jsonb(p_new_specialty)
    )
    where id = p_user_id;

    -- Mettre à jour la table profiles si elle existe
    update public.profiles
    set specialty = p_new_specialty,
        updated_at = now()
    where id = p_user_id;
    v_profiles_count := FOUND;

    -- Mettre à jour la table retex_responses si elle existe
    update public.retex_responses
    set specialty = p_new_specialty
    where user_id = p_user_id;
    v_retex_count := FOUND;

    return jsonb_build_object(
        'user_id', p_user_id,
        'new_specialty', p_new_specialty,
        'tables_updated', jsonb_build_object(
            'auth_users', true,
            'profiles', v_profiles_count::boolean,
            'retex_responses', v_retex_count::boolean
        ),
        'updated_at', now()::text
    );
end;
$$;

revoke all on function public.update_candidate_specialty(uuid, text) from public, anon;
grant execute on function public.update_candidate_specialty(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- Vérification: Exécutez cette requête pour vérifier la fonction
-- ============================================================================
-- SELECT routine_name, routine_definition 
-- FROM information_schema.routines 
-- WHERE routine_name = 'update_candidate_specialty' 
-- AND routine_schema = 'public';
