// Supabase Edge Function: gc-tier-seats
//
// Deletes expired tier_seats reservations — rows where status = 'reserved'
// and reserved_until < now(). Under normal operation the scan in
// web/lib/seats.ts#reserveSeat sweeps a stale reservation when the SAME
// seat is grabbed again, but reservations on seats nobody re-selects
// pile up and clutter availability queries. This cron-style function
// cleans them on a schedule.
//
// Deploy from the Supabase dashboard (Edge Functions > Deploy new function)
// or via the CLI:
//   supabase functions deploy gc-tier-seats --no-verify-jwt
//
// Schedule it via pg_cron in the SQL editor once deployed:
//   select cron.schedule(
//     'gc-tier-seats-every-2-min',
//     '*/2 * * * *',
//     $$ select net.http_post(
//          url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gc-tier-seats',
//          headers := '{"Authorization":"Bearer <ANON_KEY>"}'::jsonb
//        ) $$
//   );
//
// Safe to run manually with:
//   curl -X POST https://<project>.supabase.co/functions/v1/gc-tier-seats \
//        -H "Authorization: Bearer <ANON_KEY>"
//
// Runtime: Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ error: "SUPABASE_URL / SERVICE_ROLE_KEY not set in function env" }, 500);
  }

  const client = createClient(supabaseUrl, serviceKey);
  const cutoff = new Date().toISOString();

  // Count the victims first so we can report what we reaped.
  const { count: expiringCount, error: countErr } = await client
    .from("tier_seats")
    .select("id", { count: "exact", head: true })
    .eq("status", "reserved")
    .lt("reserved_until", cutoff);

  if (countErr) {
    return jsonResp({ error: countErr.message, stage: "count" }, 500);
  }

  const { error: delErr } = await client
    .from("tier_seats")
    .delete()
    .eq("status", "reserved")
    .lt("reserved_until", cutoff);

  if (delErr) {
    return jsonResp({ error: delErr.message, stage: "delete" }, 500);
  }

  return jsonResp({
    ok: true,
    deleted: expiringCount ?? 0,
    cutoff,
  });
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
