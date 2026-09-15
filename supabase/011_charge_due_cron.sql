-- Schedule the charge-due Edge Function to run hourly.
-- Run in Supabase SQL editor AFTER:
--   1. Deploying the function with `supabase functions deploy charge-due --no-verify-jwt`
--   2. Setting CRANKER_KEYPAIR_JSON and RPC_URL in function secrets
--   3. Funding the cranker wallet with ~0.5 SOL on devnet for tx fees
--
-- Replace <ANON_KEY> with the project's anon key before running.
-- The cranker pays tx fees only; the actual USDC transfer uses the
-- delegate the subscriber granted at subscribe time.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('charge-due-hourly')
where exists (
    select 1 from cron.job where jobname = 'charge-due-hourly'
);

select cron.schedule(
    'charge-due-hourly',
    '0 * * * *',
    $$
        select net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/charge-due',
            headers := jsonb_build_object(
                'Authorization', 'Bearer <ANON_KEY>',
                'Content-Type', 'application/json'
            )
        )
    $$
);

select jobid, schedule, command, active
from cron.job
where jobname = 'charge-due-hourly';
