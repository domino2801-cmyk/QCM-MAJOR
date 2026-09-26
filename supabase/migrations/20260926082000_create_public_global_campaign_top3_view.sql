create or replace function public.get_public_global_campaign_top3()
returns table (
    display_name text,
    score double precision,
    created_at text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        coalesce(
            nullif(trim(name), ''),
            nullif(trim(label), ''),
            'Candidat inconnu'
        ) as display_name,
        score::double precision,
        created_at::text
    from public.quiz_results
    where theme = 'all'
    order by score desc, created_at desc
    limit 3;
$$;

revoke all on function public.get_public_global_campaign_top3() from public;
grant execute on function public.get_public_global_campaign_top3() to anon, authenticated;
