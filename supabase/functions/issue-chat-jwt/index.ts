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
import { SignJWT } from "https://esm.sh/jose@5.9.3";

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
  if (!valid) return jsonResp({ error: "Bad signature" }, 401);

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

  // 3. Sign a Supabase-verifiable JWT.
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
  if (!jwtSecret) return jsonResp({ error: "Function not configured" }, 500);
  const secretKey = new TextEncoder().encode(jwtSecret);

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(wallet)
    .setAudience("authenticated")
    .setIssuer("nodosol-chat")
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(secretKey);

  return jsonResp({ jwt, expiresAt: now + JWT_TTL_SECONDS }, 200);
});

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
