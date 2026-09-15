// Supabase Edge Function: admin-events
//
// Read-only window into the security_events table for the /admin panel.
// security_events has RLS on with no client policies, so reads are gated
// behind a fresh wallet signature plus an env-var allowlist of admin
// wallets. Returns the most recent rows plus a per-type count over the
// configured lookback window.
//
// Auth model:
//   1. Caller signs the challenge `nodosol-admin:v1:<wallet>:<unixMs>`
//      with their wallet (≤2 minutes old).
//   2. Function verifies the ed25519 signature.
//   3. Function checks the wallet pubkey is in the comma-separated
//      ADMIN_WALLETS env var. Empty/unset = nobody passes (safe default).
//
// Deploy:
//   supabase functions deploy admin-events --no-verify-jwt
//   supabase secrets set ADMIN_WALLETS="<comma,separated,base58>"
//
// Runtime: Deno.

import nacl from "https://esm.sh/tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AGE_MS = 2 * 60 * 1000;
const RECENT_LIMIT = 20;
const COUNT_WINDOW_HOURS = 24;
const LOOKBACK_HOURS = 24;

type Payload = {
  wallet?: unknown;
  message?: unknown;
  signature?: unknown;
};

type LoggerClient = {
  from: (table: string) => {
    insert: (
      row: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };
};

function extractClientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function logSecurityEvent(
  admin: LoggerClient,
  req: Request,
  event: {
    type: string;
    severity?: "info" | "warn" | "error";
    wallet?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("security_events").insert({
      event_type: event.type,
      severity: event.severity ?? "info",
      wallet: event.wallet ?? null,
      client_ip: extractClientIp(req),
      details: event.details ?? {},
    });
    if (error) console.warn("security_events insert failed:", error.message);
  } catch (err) {
    console.warn("security_events logger threw", err);
  }
}

function parseAllowlist(): Set<string> {
  const raw = Deno.env.get("ADMIN_WALLETS") ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "POST only" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400);
  }

  const wallet = typeof payload.wallet === "string" ? payload.wallet : null;
  const message = typeof payload.message === "string" ? payload.message : null;
  const signature = typeof payload.signature === "string" ? payload.signature : null;
  if (!wallet || !message || !signature) {
    return jsonResp({ error: "Missing fields" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return jsonResp({ error: "Function not configured" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Signature verify.
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(wallet);
    sigBytes = bs58.decode(signature);
  } catch {
    return jsonResp({ error: "Invalid base58 pubkey or signature" }, 400);
  }
  if (pubkeyBytes.length !== 32 || sigBytes.length !== 64) {
    return jsonResp({ error: "Wrong pubkey/signature length" }, 400);
  }
  const messageBytes = new TextEncoder().encode(message);
  const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!valid) {
    await logSecurityEvent(admin, req, {
      type: "sig_verify_fail",
      severity: "warn",
      wallet,
      details: { endpoint: "admin-events" },
    });
    return jsonResp({ error: "Bad signature" }, 401);
  }

  // 2. Challenge format: nodosol-admin:v1:<wallet>:<timestampMs>
  const parts = message.split(":");
  if (parts.length !== 4 || parts[0] !== "nodosol-admin" || parts[1] !== "v1") {
    return jsonResp({ error: "Bad challenge format" }, 400);
  }
  if (parts[2] !== wallet) {
    return jsonResp({ error: "Wallet/challenge mismatch" }, 400);
  }
  const ts = Number(parts[3]);
  if (!Number.isFinite(ts)) return jsonResp({ error: "Bad timestamp" }, 400);
  const age = Date.now() - ts;
  if (age < -60_000 || age > MAX_AGE_MS) {
    await logSecurityEvent(admin, req, {
      type: "challenge_expired",
      severity: "warn",
      wallet,
      details: { endpoint: "admin-events", ageMs: age },
    });
    return jsonResp({ error: "Challenge expired — re-sign" }, 401);
  }

  // 3. Allowlist check. Empty/unset env = nobody passes.
  const allowlist = parseAllowlist();
  if (!allowlist.has(wallet)) {
    await logSecurityEvent(admin, req, {
      type: "admin_access_denied",
      severity: "warn",
      wallet,
      details: { endpoint: "admin-events" },
    });
    return jsonResp({ error: "Wallet not on admin allowlist" }, 403);
  }

  // 4. Read recent events + counts. Two queries: one ordered list (the
  //    feed) and one aggregate-by-type for the summary tiles. The count
  //    query uses head:true so Supabase only returns the count, not rows.
  const windowStart = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: recent, error: recentErr } = await admin
    .from("security_events")
    .select("id, created_at, event_type, severity, wallet, client_ip, details")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (recentErr) {
    return jsonResp({ error: `Recent fetch failed: ${recentErr.message}` }, 500);
  }

  const { data: countRows, error: countsErr } = await admin
    .from("security_events")
    .select("event_type")
    .gte("created_at", new Date(Date.now() - COUNT_WINDOW_HOURS * 60 * 60 * 1000).toISOString());
  if (countsErr) {
    return jsonResp({ error: `Counts fetch failed: ${countsErr.message}` }, 500);
  }

  const counts: Record<string, number> = {};
  for (const row of countRows ?? []) {
    const t = (row as { event_type: string }).event_type;
    counts[t] = (counts[t] ?? 0) + 1;
  }

  await logSecurityEvent(admin, req, {
    type: "admin_events_query",
    wallet,
    details: { recentLimit: RECENT_LIMIT, countWindowHours: COUNT_WINDOW_HOURS },
  });

  return jsonResp(
    {
      ok: true,
      recent: recent ?? [],
      counts,
      windowStart,
      countWindowHours: COUNT_WINDOW_HOURS,
      generatedAt: new Date().toISOString(),
    },
    200,
  );
});

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
