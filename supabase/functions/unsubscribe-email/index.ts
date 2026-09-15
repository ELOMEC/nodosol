// Supabase Edge Function: unsubscribe-email
//
// Honours one-click unsubscribe links from email footers. The token is
// an HS256-signed JWT with payload { w: wallet, t: type|"*", exp: secs }
// signed with UNSUBSCRIBE_TOKEN_SECRET (shared with send-notification-email).
//
// GET /functions/v1/unsubscribe-email?t=<jwt>
//   Verifies signature + exp, removes the type from
//   notification_preferences.email_types (or wipes the whole list when
//   t = "*" / all). Returns JSON `{ ok: true, scope, email }`.
//
// The web /u Next route hits this server-side and renders a friendly
// confirmation page so the user-visible URL stays on nodosol.com.
//
// Setup (do once):
//   supabase functions deploy unsubscribe-email --no-verify-jwt
//   supabase secrets set UNSUBSCRIBE_TOKEN_SECRET=<random 32-byte hex>
//   (also set in send-notification-email so signers and verifiers agree)
//
// Runtime: Deno.

import { verify as verifyJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

type UnsubPayload = {
  w?: unknown;
  t?: unknown;
  exp?: unknown;
};

async function logSecurityEvent(
  url: string,
  serviceKey: string,
  req: Request,
  event: {
    type: string;
    severity?: "info" | "warn" | "error";
    wallet?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const { error } = await admin.from("security_events").insert({
      event_type: event.type,
      severity: event.severity ?? "info",
      wallet: event.wallet ?? null,
      client_ip: clientIp,
      details: event.details ?? {},
    });
    if (error) console.warn("security_events insert failed:", error.message);
  } catch (err) {
    console.warn("security_events logger threw", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return jsonResp({ error: "GET only" }, 405);
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ?? "";
  if (!sbUrl || !sbKey || !secret) {
    return jsonResp({ error: "Server misconfigured" }, 500);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return jsonResp({ error: "Missing token" }, 400);
  }

  // Verify HS256 signature + exp.
  let payload: UnsubPayload;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    payload = (await verifyJwt(token, key)) as UnsubPayload;
  } catch (err) {
    await logSecurityEvent(sbUrl, sbKey, req, {
      type: "unsub_token_invalid",
      severity: "warn",
      details: { reason: err instanceof Error ? err.message : String(err) },
    });
    return jsonResp({ error: "Invalid or expired token" }, 401);
  }

  if (typeof payload.w !== "string" || typeof payload.t !== "string") {
    return jsonResp({ error: "Bad token shape" }, 400);
  }
  const wallet = payload.w;
  const target = payload.t; // "*" or a specific type key
  // djwt enforces exp itself but be belt-and-suspenders explicit:
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    return jsonResp({ error: "Token expired" }, 410);
  }

  const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data: row } = await admin
    .from("notification_preferences")
    .select("email_types, email")
    .eq("wallet_pubkey", wallet)
    .maybeSingle();

  let nextTypes: string;
  let scope: "all" | string;
  if (target === "*" || target === "all") {
    nextTypes = "";
    scope = "all";
  } else {
    const cur = (row?.email_types ?? "").trim();
    if (cur === "" || cur === target) {
      nextTypes = "";
    } else if (cur === "*") {
      // Was the all-shorthand; expand to "everything except <target>" is
      // unsafe (we don't know the canonical full set here), so degrade to
      // empty rather than silently keep emailing.
      nextTypes = "";
    } else {
      const set = new Set(
        cur.split(",").map((s) => s.trim()).filter(Boolean),
      );
      set.delete(target);
      nextTypes = Array.from(set).join(",");
    }
    scope = target;
  }

  // Idempotent: even if no row, upsert so subsequent inserts respect the opt-out.
  const { error: upsertErr } = await admin
    .from("notification_preferences")
    .upsert(
      {
        wallet_pubkey: wallet,
        email_types: nextTypes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_pubkey" },
    );
  if (upsertErr) {
    console.error("unsubscribe upsert failed", upsertErr);
    return jsonResp({ error: "Server error" }, 500);
  }

  await logSecurityEvent(sbUrl, sbKey, req, {
    type: "email_unsubscribed",
    severity: "info",
    wallet,
    details: { scope },
  });

  return jsonResp({
    ok: true,
    scope,
    email: row?.email ?? null,
  });
});

function jsonResp(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
