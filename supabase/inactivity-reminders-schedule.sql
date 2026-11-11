create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
    if not exists (select 1 from vault.decrypted_secrets where name = 'qcm_inactivity_project_url')
       or not exists (select 1 from vault.decrypted_secrets where name = 'qcm_inactivity_cron_secret') then
        raise exception 'Configure qcm_inactivity_project_url and qcm_inactivity_cron_secret in Vault first';
    end if;
end;
$$;

select cron.schedule(
    'qcm-inactivity-reminders',
    '*/15 * * * *',
    $job$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'qcm_inactivity_project_url')
            || '/functions/v1/inactivity-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-qcm-reminder-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'qcm_inactivity_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $job$
);
