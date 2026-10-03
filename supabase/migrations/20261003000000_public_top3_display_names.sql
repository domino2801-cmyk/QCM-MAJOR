create or replace function public.get_public_global_campaign_top3()
returns table (display_name text, score double precision, created_at text)
language sql stable security definer
set search_path = ''
as $$
    select
        case
            when position('@' in coalesce(
                nullif(trim(r.name), ''),
                nullif(trim(to_jsonb(r) ->> 'label'), ''),
                'Candidat inconnu'
            )) > 0 then 'Pseudo non renseigné'
            else coalesce(
                nullif(trim(r.name), ''),
                nullif(trim(to_jsonb(r) ->> 'label'), ''),
                'Candidat inconnu'
            )
        end as display_name,
        r.score::double precision,
        r.created_at::text
    from public.quiz_results r
    where r.theme = 'all' and r.score is not null
    order by r.score desc, r.created_at asc nulls last, r.id
    limit 3;
$$;

revoke all on function public.get_public_global_campaign_top3() from public;
grant execute on function public.get_public_global_campaign_top3() to anon, authenticated;
notify pgrst, 'reload schema';
