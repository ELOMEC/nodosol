-- Schedule the auction-reminders Edge Function to run hourly.
--
-- Run in Supabase SQL editor AFTER:
--   1. Deploying the function:
--        supabase functions deploy auction-reminders --no-verify-jwt
--   2. Verifying the function secrets:
--        SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected)
--        RPC_URL (set to your Helius mainnet/devnet URL when available;
--          defaults to https://api.devnet.solana.com inside the function)
--
-- Replace <ANON_KEY> with the project's anon key before running.
-- The function emits one `auction_ending_soon` notification per
-- (bidder, auction) pair; subsequent runs hit the unique constraint
-- on (wallet_pubkey, signature, type) and skip cleanly.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('auction-reminders-hourly')
where exists (
    select 1 from cron.job where jobname = 'auction-reminders-hourly'
);

select cron.schedule(
    'auction-reminders-hourly',
    '0 * * * *',
    $$
        select net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/auction-reminders',
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
where jobname = 'auction-reminders-hourly';
