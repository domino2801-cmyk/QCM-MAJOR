drop function public.grade_question_answer(text, integer);

create function public.grade_question_answer(
    p_question_id text,
    p_selected_index integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    correct_index integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if p_question_id is null
       or (p_selected_index is not null
           and (p_selected_index < 0 or p_selected_index > 3)) then
        raise exception 'A question and a valid answer index are required'
            using errcode = '22023';
    end if;

    select
        case
            when q.correct_answer = q.answer_1 then 0
            when q.correct_answer = q.answer_2 then 1
            when q.correct_answer = q.answer_3 then 2
            when q.correct_answer = q.answer_4 then 3
            when q.correct_answer ~ '^[1-4]$' then q.correct_answer::integer - 1
            else 0
        end
    into correct_index
    from public.question_bank as q
    where q.id::text = p_question_id
      and q.active is true;

    if not found then
        raise exception 'Active question not found'
            using errcode = 'P0002';
    end if;

    return correct_index;
end;
$$;

revoke all on function public.grade_question_answer(text, integer) from public;
grant execute on function public.grade_question_answer(text, integer) to authenticated;
