// Supabase Edge Function: issue-chat-jwt
//
// Verifies a Solana ed25519 signature over a nodosol-chat-auth challenge
// and returns a Supabase-compatible JWT whose `sub` claim is the wallet
// pubkey. Signed with SUPABASE_JWT_SECRET so Supabase's built-in JWT
// verifier accepts it, letting RLS policies key off the wallet.
//
// Deploy:
//   supabase functions deploy issue-chat-jwt --no-verify-jwt
//
// Runtime: Deno.

import nacl from "https://esm.sh/tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { create as createJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  wallet: string;
  message: string; // exact UTF-8 string that was signed
  signature: string; // base58 of 64-byte ed25519 sig
};

// Challenge freshness window — tighter than post-chat-message because
// the JWT we issue lives 15 minutes already.
const MAX_AGE_MS = 2 * 60 * 1000;

// JWT TTL. 15 minutes matches post-chat-message's session-sig TTL in
// ChatPanel so one wallet signature bootstraps both read and write auth.
const JWT_TTL_SECONDS = 15 * 60;

// Best-effort security event logger — mirrors the helper in
// post-chat-message. Failures must never break the request.
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
  if (req.method !== "POST") {
    return jsonResp({ error: "POST only" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400);
  }

  const { wallet, message, signature } = payload;
  if (typeof wallet !== "string" || typeof message !== "string" || typeof signature !== "string") {
    return jsonResp({ error: "Missing fields" }, 400);
  }

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
    const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (sbUrl && sbKey) {
      await logSecurityEvent(sbUrl, sbKey, req, {
        type: "sig_verify_fail",
        severity: "warn",
        wallet,
        details: { endpoint: "issue-chat-jwt" },
      });
    }
    return jsonResp({ error: "Bad signature" }, 401);
  }

  // 2. Challenge format: nodosol-chat-auth:v1:<wallet>:<timestampMs>
  const parts = message.split(":");
  if (parts.length !== 4 || parts[0] !== "nodosol-chat-auth" || parts[1] !== "v1") {
    return jsonResp({ error: "Bad challenge format" }, 400);
  }
  if (parts[2] !== wallet) {
    return jsonResp({ error: "Wallet/challenge mismatch" }, 400);
  }
  const ts = Number(parts[3]);
  if (!Number.isFinite(ts)) return jsonResp({ error: "Bad timestamp" }, 400);
  const age = Date.now() - ts;
  if (age < -60_000 || age > MAX_AGE_MS) {
    return jsonResp({ error: "Challenge expired — re-sign" }, 401);
  }

  // 3. Sign a Supabase-verifiable JWT. Must match the project's JWT secret
  // from Dashboard → Settings → API → JWT Settings. Stored as CHAT_JWT_SECRET
  // because the Supabase Edge Functions runtime reserves the SUPABASE_ prefix
  // for platform-provided env vars and refuses user-set ones with that prefix.
  const jwtSecret = Deno.env.get("CHAT_JWT_SECRET") ?? "";
  if (!jwtSecret) return jsonResp({ error: "Function not configured" }, 500);

  try {
    const secretKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );

    const now = Math.floor(Date.now() / 1000);
    const jwt = await createJwt(
      { alg: "HS256", typ: "JWT" },
      {
        sub: wallet,
        role: "authenticated",
        aud: "authenticated",
        iss: "nodosol-chat",
        iat: now,
        exp: now + JWT_TTL_SECONDS,
      },
      secretKey,
    );

    // Best-effort log of successful issuance — lets us spot anomalies
    // like one wallet minting 50 JWTs a minute, or a surge of brand-new
    // wallets during what should be quiet hours.
    const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (sbUrl && sbKey) {
      await logSecurityEvent(sbUrl, sbKey, req, {
        type: "jwt_issued",
        severity: "info",
        wallet,
        details: { ttlSeconds: JWT_TTL_SECONDS },
      });
    }

    return jsonResp({ jwt, expiresAt: now + JWT_TTL_SECONDS }, 200);
  } catch (err) {
    console.error("JWT sign failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: `JWT sign failed: ${msg}` }, 500);
  }
});

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
