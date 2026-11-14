-- ============================================================================
-- MIGRATION FIX: Update Specialty Function
-- 
-- ⚠️ EXÉCUTEZ CE SCRIPT POUR CORRIGER LA FONCTION
-- Remplace la version précédente qui avait une erreur
-- 
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
    v_profiles_count int;
    v_retex_count int;
    v_profiles_specialty_exists boolean;
    v_profiles_speciality_exists boolean;
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

    -- Mettre à jour la spécialité dans auth.users (TOUJOURS)
    update auth.users
    set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{specialty}',
        to_jsonb(p_new_specialty)
    )
    where id = p_user_id;

    -- Vérifier si les colonnes existent dans profiles
    select exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'specialty'
    ) into v_profiles_specialty_exists;

    select exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'speciality'
    ) into v_profiles_speciality_exists;

    -- Mettre à jour profiles si la colonne 'specialty' existe
    if v_profiles_specialty_exists then
        update public.profiles
        set specialty = p_new_specialty,
            updated_at = now()
        where id = p_user_id;
        v_profiles_count := FOUND;
    -- Sinon essayer avec 'speciality' (avec i)
    elsif v_profiles_speciality_exists then
        update public.profiles
        set speciality = p_new_specialty,
            updated_at = now()
        where id = p_user_id;
        v_profiles_count := FOUND;
    end if;

    -- Mettre à jour la table retex_responses si elle existe
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'retex_responses') then
        update public.retex_responses
        set specialty = p_new_specialty
        where user_id = p_user_id;
        v_retex_count := FOUND;
    end if;

    return jsonb_build_object(
        'user_id', p_user_id,
        'new_specialty', p_new_specialty,
        'tables_updated', jsonb_build_object(
            'auth_users', true,
            'profiles', v_profiles_count::boolean,
            'profiles_column_used', case 
                when v_profiles_specialty_exists then 'specialty'
                when v_profiles_speciality_exists then 'speciality'
                else null
            end,
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
