alter table public.admin_push_subscriptions
    drop constraint if exists admin_push_subscriptions_endpoint_check;

alter table public.admin_push_subscriptions
    add constraint admin_push_subscriptions_endpoint_check check (
        char_length(endpoint) <= 2048
        and (
            endpoint like 'https://fcm.googleapis.com/%'
            or endpoint like 'https://updates.push.services.mozilla.com/%'
            or endpoint like 'https://%.push.services.mozilla.com/%'
            or endpoint like 'https://web.push.apple.com/%'
            or endpoint like 'https://%.push.apple.com/%'
            or endpoint like 'https://%.notify.windows.com/%'
        )
    );
