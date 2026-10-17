alter table public.question_bank enable row level security;

do $$
declare
    select_policy record;
begin
    for select_policy in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = 'question_bank'
          and cmd = 'SELECT'
    loop
        execute format('drop policy %I on public.question_bank', select_policy.policyname);
    end loop;
end $$;

create policy "Anyone can read active questions"
on public.question_bank
for select
to anon, authenticated
using (active is true);

revoke select on table public.question_bank from public, anon, authenticated;
revoke select (correct_answer) on table public.question_bank from public, anon, authenticated;
grant select (
    id,
    theme_id,
    question,
    answer_1,
    answer_2,
    answer_3,
    answer_4,
    active
) on table public.question_bank to anon, authenticated;

create or replace function public.get_admin_question_bank(
    p_limit integer default 1000,
    p_offset integer default 0
)
returns table (
    id text,
    theme_id text,
    question text,
    answer_1 text,
    answer_2 text,
    answer_3 text,
    answer_4 text,
    correct_index integer,
    active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null
       or not coalesce((
           (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
           or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
       ), false) then
        raise exception 'Administrator access required'
            using errcode = '42501';
    end if;

    return query
    select
        q.id::text,
        q.theme_id::text,
        q.question::text,
        q.answer_1::text,
        q.answer_2::text,
        q.answer_3::text,
        q.answer_4::text,
        case
            when q.correct_answer = q.answer_1 then 0
            when q.correct_answer = q.answer_2 then 1
            when q.correct_answer = q.answer_3 then 2
            when q.correct_answer = q.answer_4 then 3
            when q.correct_answer ~ '^[1-4]$' then q.correct_answer::integer - 1
            else 0
        end,
        q.active
    from public.question_bank as q
    order by q.id
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_admin_question_bank(integer, integer) from public;
grant execute on function public.get_admin_question_bank(integer, integer) to authenticated;

create or replace function public.grade_question_answer(
    p_question_id text,
    p_selected_index integer
)
returns boolean
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
       or p_selected_index is null
       or p_selected_index < 0
       or p_selected_index > 3 then
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

    return correct_index = p_selected_index;
end;
$$;

revoke all on function public.grade_question_answer(text, integer) from public;
grant execute on function public.grade_question_answer(text, integer) to authenticated;

alter table public.question_reports
    alter column correct_answer_index drop not null;
