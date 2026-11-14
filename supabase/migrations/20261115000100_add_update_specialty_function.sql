begin;

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

    update auth.users
    set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{specialty}',
        to_jsonb(p_new_specialty)
    )
    where id = p_user_id
    returning raw_app_meta_data into v_updated_data;

    return jsonb_build_object(
        'user_id', p_user_id,
        'new_specialty', p_new_specialty,
        'updated_at', now()::text
    );
end;
$$;

revoke all on function public.update_candidate_specialty(uuid, text) from public, anon;
grant execute on function public.update_candidate_specialty(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
