create or replace function public.reject_professional_email()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.email, '')) ~ '@([a-z0-9-]+\.)*intradef\.gouv\.fr$' then
    raise exception 'Pas de compte professionnel';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_professional_email on auth.users;
create trigger reject_professional_email
before insert on auth.users
for each row execute function public.reject_professional_email();
