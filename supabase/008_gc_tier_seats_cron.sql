-- Schedule the gc-tier-seats Edge Function to run every 2 minutes.
-- Run in Supabase SQL editor AFTER deploying the function:
--   https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/functions
--
-- The function deletes reserved-but-expired tier_seats rows so the
-- availability grid reflects what's genuinely free. reservedUntil is
-- set 3 minutes ahead in web/lib/seats.ts#reserveSeat; a 2-minute
-- sweep catches the vast majority within seconds of expiring.
--
-- Prerequisites (usually already enabled on Supabase projects):
--   create extension if not exists pg_cron with schema extensions;
--   create extension if not exists pg_net with schema extensions;
--
-- Replace <ANON_KEY> with the project's anon / publishable key from
-- Settings > API. Using the anon key is fine because the function
-- uses the service role key from its own env vars for the delete.

-- Ensure prerequisites (safe to re-run).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Drop any previous schedule before re-creating.
select cron.unschedule('gc-tier-seats-every-2-min')
where exists (
    select 1 from cron.job where jobname = 'gc-tier-seats-every-2-min'
);

select cron.schedule(
    'gc-tier-seats-every-2-min',
    '*/2 * * * *',
    $$
        select net.http_post(
            url := 'https://xvgxaodxylrolkpyuszx.supabase.co/functions/v1/gc-tier-seats',
            headers := jsonb_build_object(
                'Authorization', 'Bearer <ANON_KEY>',
                'Content-Type', 'application/json'
            )
        )
    $$
);

-- Verify the schedule is registered. Expect one row with this jobname.
select jobid, schedule, command, active
from cron.job
where jobname = 'gc-tier-seats-every-2-min';
