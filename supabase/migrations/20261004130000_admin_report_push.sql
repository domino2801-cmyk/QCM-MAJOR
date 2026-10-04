create extension if not exists pg_net with schema extensions;

create table public.admin_push_subscriptions (
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null check (
        endpoint like 'https://fcm.googleapis.com/%'
        and char_length(endpoint) <= 2048
    ),
    p256dh text not null check (char_length(p256dh) between 80 and 200),
    auth text not null check (char_length(auth) between 20 and 100),
    created_at timestamptz not null default now(),
    primary key (user_id, endpoint)
);

alter table public.admin_push_subscriptions enable row level security;
grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;

create policy "Admins manage their own push subscriptions"
on public.admin_push_subscriptions
for all to authenticated
using (
    user_id = auth.uid()
    and (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    )
)
with check (
    user_id = auth.uid()
    and (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        or (auth.jwt() -> 'app_metadata' ->> 'bm4_admin') in ('true', '1')
    )
);

create or replace function public.notify_admin_question_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    webhook_secret text;
begin
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'qcm_report_push_webhook_secret';

    if webhook_secret is null then
        raise warning 'QCM report push: webhook secret missing in Vault';
        return new;
    end if;

    perform net.http_post(
        url := 'https://beodiemzrunqjkvylffn.supabase.co/functions/v1/report-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-qcm-webhook-secret', webhook_secret
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'schema', 'public',
            'table', 'question_reports',
            'record', jsonb_build_object('id', new.id)
        ),
        timeout_milliseconds := 10000
    );
    return new;
end;
$$;

revoke all on function public.notify_admin_question_report() from public, anon, authenticated;

create trigger notify_admin_question_report
after insert on public.question_reports
for each row execute function public.notify_admin_question_report();
