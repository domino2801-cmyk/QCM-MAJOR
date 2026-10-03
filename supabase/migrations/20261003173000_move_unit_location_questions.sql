begin;

with classified as (
    select id,
        translate(lower(question),
            'àâäéèêëîïôöùûüç',
            'aaaeeeeiioouuuc') as normalized_question
    from public.question_bank
),
moved as (
    update public.question_bank as question
    set theme_id = 5
    from classified
    where question.id = classified.id
      and question.theme_id is distinct from 5
      and classified.normalized_question not like '%musee%'
      and classified.normalized_question not like '%organigramme%'
      and (
          classified.normalized_question ~ 'implant|stationn|garnison'
          or classified.normalized_question ~ '(ctts|groupement de cyberdefense).*base'
          or classified.normalized_question ~ 'siege.*(deplace|otan)|(ville|commune).*(brigade|regiment|bataillon|centre de formation)'
          or classified.normalized_question ~ 'installe|centac.*situe|camp militaire.*superficie'
          or classified.normalized_question ~ '(etats|etat).*accueille.*(forces francaises|elements francais)'
      )
    returning question.id
)
select count(*) as moved_questions from moved;

commit;
