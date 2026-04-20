// Supabase Edge Function: post-chat-message
//
// Verifies a Solana ed25519 signature before inserting a chat message
// into chat_messages. Prevents clients from impersonating another wallet.
//
// Deploy from the Supabase dashboard (Edge Functions > Deploy new function)
// or via the CLI:
//   supabase functions deploy post-chat-message --no-verify-jwt
//
// Runtime: Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  threadMemoHash: string;
  body: string;
  senderPubkey: string;
  message: string; // exact UTF-8 string that was signed
  signature: string; // base58 of 64-byte ed25519 sig
};

// Accept messages up to 15 minutes old.
const MAX_AGE_MS = 15 * 60 * 1000;
const MESSAGE_MAX_CHARS = 2000;

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

  const { threadMemoHash, body, senderPubkey, message, signature } = payload;
  if (
    typeof threadMemoHash !== "string" ||
    typeof body !== "string" ||
    typeof senderPubkey !== "string" ||
    typeof message !== "string" ||
    typeof signature !== "string"
  ) {
    return jsonResp({ error: "Missing fields" }, 400);
  }
  if (!body.trim()) return jsonResp({ error: "Empty body" }, 400);
  if (body.length > MESSAGE_MAX_CHARS) return jsonResp({ error: "Body too long" }, 400);

  // 1. Signature verification.
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(senderPubkey);
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

  // 2. Message format + freshness.
  // Expected: nodosol-chat:v1:<threadMemoHash>:<senderPubkey>:<timestampMs>
  const parts = message.split(":");
  if (parts.length !== 5 || parts[0] !== "nodosol-chat" || parts[1] !== "v1") {
    return jsonResp({ error: "Bad challenge format" }, 400);
  }
  if (parts[2] !== threadMemoHash) {
    return jsonResp({ error: "Thread/challenge mismatch" }, 400);
  }
  if (parts[3] !== senderPubkey) {
    return jsonResp({ error: "Sender/challenge mismatch" }, 400);
  }
  const ts = Number(parts[4]);
  if (!Number.isFinite(ts)) return jsonResp({ error: "Bad timestamp" }, 400);
  const age = Date.now() - ts;
  if (age < -60_000 || age > MAX_AGE_MS) {
    return jsonResp({ error: "Challenge expired — re-sign" }, 401);
  }

  // 3. Authorisation: sender must be seller or buyer of the thread.
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return jsonResp({ error: "Function not configured" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: thread, error: threadErr } = await admin
    .from("chat_threads")
    .select("seller_pubkey, buyer_pubkey")
    .eq("memo_hash", threadMemoHash)
    .maybeSingle();
  if (threadErr) return jsonResp({ error: threadErr.message }, 500);
  if (!thread) return jsonResp({ error: "Thread not found" }, 404);
  if (senderPubkey !== thread.seller_pubkey && senderPubkey !== thread.buyer_pubkey) {
    return jsonResp({ error: "Only the deal's seller or buyer may post" }, 403);
  }

  // 4. Insert.
  const { data: inserted, error: insertErr } = await admin
    .from("chat_messages")
    .insert({
      thread_memo_hash: threadMemoHash,
      sender_pubkey: senderPubkey,
      body,
    })
    .select()
    .single();
  if (insertErr) return jsonResp({ error: insertErr.message }, 500);

  return jsonResp({ ok: true, message: inserted }, 200);
});

function jsonResp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
