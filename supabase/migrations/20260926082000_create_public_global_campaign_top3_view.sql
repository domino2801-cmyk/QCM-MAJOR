create or replace view public.public_global_campaign_top3 as
select
    coalesce(
        nullif(trim(name), ''),
        nullif(trim(label), ''),
        'Candidat inconnu'
    ) as display_name,
    score,
    created_at
from public.quiz_results
where theme = 'all'
order by score desc, created_at desc
limit 3;

grant select on public.public_global_campaign_top3 to anon, authenticated;
