-- Administration sécurisée de la banque QCM-MAJOR depuis DOCTRINE.
-- Les écritures passent par des RPC SECURITY DEFINER : aucun droit direct
-- INSERT/UPDATE/DELETE n'est accordé au navigateur sur question_bank.

create or replace function public.admin_create_question(
    p_theme_id text,
    p_question text,
    p_answer_1 text,
    p_answer_2 text,
    p_answer_3 text,
    p_answer_4 text,
    p_correct_index integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_id text;
    answers text[] := array[p_answer_1, p_answer_2, p_answer_3, p_answer_4];
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if p_theme_id not in ('0', '1', '2', '3', '4', '5')
       or nullif(btrim(p_question), '') is null
       or array_position(answers, null) is not null
       or p_correct_index not between 0 and 3 then
        raise exception 'Invalid question data' using errcode = '22023';
    end if;

    insert into public.question_bank (
        theme_id, question, answer_1, answer_2, answer_3, answer_4, correct_answer, active
    ) values (
        p_theme_id::integer, btrim(p_question), btrim(p_answer_1), btrim(p_answer_2),
        btrim(p_answer_3), btrim(p_answer_4), btrim(answers[p_correct_index + 1]), true
    )
    returning id::text into new_id;

    return new_id;
end;
$$;

create or replace function public.admin_update_question(
    p_question_id text,
    p_theme_id text,
    p_question text,
    p_answer_1 text,
    p_answer_2 text,
    p_answer_3 text,
    p_answer_4 text,
    p_correct_index integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    answers text[] := array[p_answer_1, p_answer_2, p_answer_3, p_answer_4];
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if p_question_id is null
       or p_theme_id not in ('0', '1', '2', '3', '4', '5')
       or nullif(btrim(p_question), '') is null
       or array_position(answers, null) is not null
       or p_correct_index not between 0 and 3 then
        raise exception 'Invalid question data' using errcode = '22023';
    end if;

    update public.question_bank
    set theme_id = p_theme_id::integer,
        question = btrim(p_question),
        answer_1 = btrim(p_answer_1),
        answer_2 = btrim(p_answer_2),
        answer_3 = btrim(p_answer_3),
        answer_4 = btrim(p_answer_4),
        correct_answer = btrim(answers[p_correct_index + 1])
    where id::text = p_question_id;

    return found;
end;
$$;

create or replace function public.admin_move_question_theme(
    p_question_id text,
    p_theme_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if p_question_id is null or p_theme_id not in ('0', '1', '2', '3', '4', '5') then
        raise exception 'Invalid question data' using errcode = '22023';
    end if;

    update public.question_bank
    set theme_id = p_theme_id::integer
    where id::text = p_question_id;

    return found;
end;
$$;

create or replace function public.admin_delete_question(p_question_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;

    if p_question_id is null then
        raise exception 'Question id is required' using errcode = '22023';
    end if;

    delete from public.question_bank where id::text = p_question_id;
    return found;
end;
$$;

revoke all on function public.admin_create_question(text, text, text, text, text, text, integer) from public;
revoke all on function public.admin_update_question(text, text, text, text, text, text, text, integer) from public;
revoke all on function public.admin_move_question_theme(text, text) from public;
revoke all on function public.admin_delete_question(text) from public;

grant execute on function public.admin_create_question(text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.admin_update_question(text, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.admin_move_question_theme(text, text) to authenticated;
grant execute on function public.admin_delete_question(text) to authenticated;
