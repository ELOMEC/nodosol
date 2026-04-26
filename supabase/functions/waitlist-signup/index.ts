// Supabase Edge Function: waitlist-signup
//
// Public-facing endpoint for the marketing landing page email capture.
// Validates email format, applies a per-IP rate limit (10/h) backed by
// security_events, then inserts into the `waitlist` table via the
// service role. Returns a best-effort queue position so the form can
// render a "You're #N on the list" success state.
//
// Deploy:
//   supabase functions deploy waitlist-signup --no-verify-jwt
//
// Runtime: Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  email?: unknown;
  source?: unknown;
  role?: unknown;
  referrer?: unknown;
  walletPubkey?: unknown;
};

// Mirrors the CHECK constraint in supabase/018_waitlist.sql so we reject
// obviously bad input before ever touching the DB.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX_LEN = 320; // RFC 5321 cap
const FREEFORM_MAX_LEN = 200;
const KNOWN_ROLES = new Set(["creator", "buyer", "issuer", "investor"]);

// Per-IP rate limit. Matches the "10/h" target from progress.md and uses
// security_events as the source of truth so it survives function cold
// starts and is visible to the same admin tooling as the other limits.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

type LoggerClient = {
  from: (table: string) => {
    insert: (
      row: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };
};

async function logSecurityEvent(
  admin: LoggerClient,
  req: Request,
  event: {
    type: string;
    severity?: "info" | "warn" | "error";
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const clientIp = extractClientIp(req);
    const { error } = await admin.from("security_events").insert({
      event_type: event.type,
      severity: event.severity ?? "info",
      wallet: null,
      client_ip: clientIp,
      details: event.details ?? {},
    });
    if (error) console.warn("security_events insert failed:", error.message);
  } catch (err) {
    console.warn("security_events logger threw", err);
  }
}

function extractClientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function asTrimmedString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (t.length > maxLen) return null;
  return t;
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

  const email = asTrimmedString(payload.email, EMAIL_MAX_LEN)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) {
    return jsonResp({ error: "Invalid email" }, 400);
  }

  const source = asTrimmedString(payload.source, FREEFORM_MAX_LEN);
  const referrer = asTrimmedString(payload.referrer, FREEFORM_MAX_LEN);
  const walletPubkey = asTrimmedString(payload.walletPubkey, 64);

  let role: string | null = null;
  if (payload.role !== undefined && payload.role !== null && payload.role !== "") {
    const r = asTrimmedString(payload.role, 32)?.toLowerCase() ?? null;
    if (!r || !KNOWN_ROLES.has(r)) {
      return jsonResp({ error: "Invalid role" }, 400);
    }
    role = r;
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return jsonResp({ error: "Function not configured" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Per-IP rate limit. Skipped when we couldn't extract an IP at all
  // (very rare in practice — Supabase always forwards one) so we don't
  // collapse every anonymous request into a single bucket.
  const clientIp = extractClientIp(req);
  if (clientIp) {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount, error: countErr } = await admin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("client_ip", clientIp)
      .eq("event_type", "waitlist_signup")
      .gte("created_at", windowStart);
    if (countErr) {
      // Fail open on count errors — better to accept a signup than to
      // 500 on a transient supabase blip. Log so it surfaces in ops.
      console.warn("waitlist rate-limit count failed:", countErr.message);
    } else if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      await logSecurityEvent(admin, req, {
        type: "rate_limit_hit",
        severity: "warn",
        details: {
          endpoint: "waitlist-signup",
          windowMin: RATE_LIMIT_WINDOW_MS / 60_000,
          cap: RATE_LIMIT_MAX,
        },
      });
      return jsonResp(
        { error: `Too many signups from this address — try again in an hour` },
        429,
      );
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("waitlist")
    .insert({
      email,
      source,
      referrer,
      role,
      wallet_pubkey: walletPubkey,
    })
    .select("id, created_at")
    .single();

  if (insertErr) {
    // 23505 = unique_violation: email already on the list. Treat as
    // success so the user doesn't learn whether their address was
    // previously enrolled (light enumeration mitigation), but skip the
    // position lookup since we don't have the original row id.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      await logSecurityEvent(admin, req, {
        type: "waitlist_signup",
        details: { duplicate: true },
      });
      return jsonResp({ ok: true }, 200);
    }
    return jsonResp({ error: insertErr.message }, 500);
  }

  // Best-effort queue position. Counts rows created at or before the
  // new row, so the first signup sees #1. If the count fails we still
  // return ok:true without a position rather than 500.
  let position: number | undefined;
  const { count: posCount, error: posErr } = await admin
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .lte("created_at", inserted.created_at);
  if (posErr) {
    console.warn("waitlist position lookup failed:", posErr.message);
  } else if (typeof posCount === "number") {
    position = posCount;
  }

  await logSecurityEvent(admin, req, {
    type: "waitlist_signup",
    details: { source: source ?? null, role: role ?? null },
  });

  return jsonResp({ ok: true, position }, 200);
});

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
