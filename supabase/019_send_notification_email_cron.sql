-- Schedule the send-notification-email Edge Function to run every minute.
--
-- Run in Supabase SQL editor AFTER:
--   1. Deploying the function:
--        supabase functions deploy send-notification-email --no-verify-jwt
--   2. Setting function secrets:
--        RESEND_API_KEY        (https://resend.com/api-keys)
--        EMAIL_FROM_ADDRESS    (e.g. "Nodosol <notifications@nodosol.com>")
--        APP_URL               (e.g. "https://www.nodosol.com")
--      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.
--
-- Replace <ANON_KEY> with the project's anon key before running.
-- The function only sends rows where:
--   notifications.email_eligible = true
--   notifications.email_sent_at IS NULL
--   the recipient has notification_preferences.email + email_verified_at
--   the notification type is in their email_types allowlist (or '*')

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('send-notification-email-1m')
where exists (
    select 1 from cron.job where jobname = 'send-notification-email-1m'
);

select cron.schedule(
    'send-notification-email-1m',
    '* * * * *',
    $$
        select net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notification-email',
            headers := jsonb_build_object(
                'Authorization', 'Bearer <ANON_KEY>',
                'Content-Type', 'application/json'
            ),
            body := '{}'::jsonb
        )
    $$
);

select jobid, schedule, command, active
from cron.job
where jobname = 'send-notification-email-1m';
