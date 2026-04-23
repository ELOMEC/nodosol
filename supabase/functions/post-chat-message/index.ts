// Supabase Edge Function: post-chat-message
//
// Verifies a Solana ed25519 signature before inserting a chat message
// into chat_messages. Prevents clients from impersonating another wallet.
//
// Supports three thread kinds (see migration 014):
//   - otc_deal     : 2-party OTC thread, keyed by on-chain memo_hash
//   - listing_dm   : 2-party buyer↔seller DM about a specific listing
//   - group        : public channel, any authenticated wallet may post
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

type ThreadType = "otc_deal" | "listing_dm" | "group";

type OtcContext = {
  sellerPubkey: string;
  buyerPubkey: string;
  dealAddress: string;
};

type ListingContext = {
  kind: "event" | "rental" | "auction" | "asset";
  listingPda: string;
  sellerPubkey: string;
  buyerPubkey: string;
};

type GroupContext = {
  channelSlug: string;
};

type Payload = {
  threadType?: ThreadType; // default 'otc_deal' for legacy clients
  threadMemoHash: string;
  body: string;
  senderPubkey: string;
  message: string; // exact UTF-8 string that was signed
  signature: string; // base58 of 64-byte ed25519 sig
  // Thread context — used when the thread row doesn't yet exist. Shape
  // depends on threadType.
  threadContext?: OtcContext | ListingContext | GroupContext;
};

const MAX_AGE_MS = 15 * 60 * 1000;
const MESSAGE_MAX_CHARS = 2000;

// Rate limit: per-sender cap across all threads.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 30;

// Anti-spam for group channels: minimum wallet SOL balance in lamports.
// 0.001 SOL is ~$0.15 at typical prices; enough friction to deter burner
// spam without being prohibitive. Only checked if GROUP_CHAT_ANTISPAM_RPC_URL
// is set.
const GROUP_MIN_LAMPORTS = 1_000_000;

function isValidPubkey(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

// sha256 helper (SubtleCrypto). Returns lowercase hex.
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const { threadMemoHash, body, senderPubkey, message, signature } = payload;
  const threadType: ThreadType = payload.threadType ?? "otc_deal";

  if (
    typeof threadMemoHash !== "string" ||
    typeof body !== "string" ||
    typeof senderPubkey !== "string" ||
    typeof message !== "string" ||
    typeof signature !== "string"
  ) {
    return jsonResp({ error: "Missing fields" }, 400);
  }
  if (!["otc_deal", "listing_dm", "group"].includes(threadType)) {
    return jsonResp({ error: "Bad threadType" }, 400);
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

  // 3. Supabase admin client.
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return jsonResp({ error: "Function not configured" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 4. Thread fetch / creation per type.
  const { data: existingThread, error: threadErr } = await admin
    .from("chat_threads")
    .select("thread_type, seller_pubkey, buyer_pubkey, channel_slug")
    .eq("memo_hash", threadMemoHash)
    .maybeSingle();
  if (threadErr) return jsonResp({ error: threadErr.message }, 500);

  // Thread exists → enforce its stored type wins (prevents a client from
  // claiming "group" for an OTC memo_hash).
  const effectiveType: ThreadType = existingThread
    ? (existingThread.thread_type as ThreadType)
    : threadType;

  if (existingThread && existingThread.thread_type !== threadType) {
    return jsonResp({ error: "threadType mismatch for existing thread" }, 400);
  }

  if (effectiveType === "otc_deal" || effectiveType === "listing_dm") {
    let seller: string;
    let buyer: string;

    if (existingThread) {
      seller = existingThread.seller_pubkey as string;
      buyer = existingThread.buyer_pubkey as string;
    } else {
      const ctx = payload.threadContext as
        | OtcContext
        | ListingContext
        | undefined;
      if (
        !ctx ||
        !isValidPubkey((ctx as OtcContext | ListingContext).sellerPubkey) ||
        !isValidPubkey((ctx as OtcContext | ListingContext).buyerPubkey)
      ) {
        return jsonResp({ error: "Missing or invalid threadContext" }, 400);
      }
      const s = (ctx as OtcContext | ListingContext).sellerPubkey;
      const b = (ctx as OtcContext | ListingContext).buyerPubkey;
      if (senderPubkey !== s && senderPubkey !== b) {
        return jsonResp({ error: "Sender must be seller or buyer" }, 403);
      }

      if (effectiveType === "otc_deal") {
        const oc = ctx as OtcContext;
        if (typeof oc.dealAddress !== "string" || oc.dealAddress.length === 0) {
          return jsonResp({ error: "Missing dealAddress" }, 400);
        }
        // Verify memo_hash matches the on-chain memo (trust but verify:
        // client derived it; here we only sanity-check length).
        if (!/^[0-9a-f]{64}$/.test(threadMemoHash)) {
          return jsonResp({ error: "Bad memo_hash format" }, 400);
        }
        const { error: upsertErr } = await admin.from("chat_threads").upsert(
          {
            memo_hash: threadMemoHash,
            thread_type: "otc_deal",
            seller_pubkey: s,
            buyer_pubkey: b,
            deal_address: oc.dealAddress,
          },
          { onConflict: "memo_hash", ignoreDuplicates: true },
        );
        if (upsertErr) return jsonResp({ error: upsertErr.message }, 500);
      } else {
        // listing_dm: verify memo_hash matches
        //   sha256(`listing:${kind}:${listingPda}:${min(s,b)}:${max(s,b)}`)
        // so a malicious client can't forge a thread pointing at different
        // parties than the hash implies.
        const lc = ctx as ListingContext;
        if (
          !["event", "rental", "auction", "asset"].includes(lc.kind) ||
          typeof lc.listingPda !== "string" ||
          lc.listingPda.length === 0
        ) {
          return jsonResp({ error: "Bad listing context" }, 400);
        }
        const [lo, hi] = s < b ? [s, b] : [b, s];
        const expected = await sha256Hex(
          `listing:${lc.kind}:${lc.listingPda}:${lo}:${hi}`,
        );
        if (expected !== threadMemoHash) {
          return jsonResp({ error: "memo_hash does not match listing context" }, 400);
        }
        const { error: upsertErr } = await admin.from("chat_threads").upsert(
          {
            memo_hash: threadMemoHash,
            thread_type: "listing_dm",
            seller_pubkey: s,
            buyer_pubkey: b,
            listing_context: {
              kind: lc.kind,
              listing_pda: lc.listingPda,
            },
          },
          { onConflict: "memo_hash", ignoreDuplicates: true },
        );
        if (upsertErr) return jsonResp({ error: upsertErr.message }, 500);
      }

      seller = s;
      buyer = b;
    }

    if (senderPubkey !== seller && senderPubkey !== buyer) {
      return jsonResp({ error: "Only the thread's two parties may post" }, 403);
    }
  } else {
    // group: thread must already exist (seeded in migration 014).
    if (!existingThread) {
      return jsonResp({ error: "Unknown group channel" }, 404);
    }

    // Anti-spam: require a minimum SOL balance, if RPC is configured.
    const rpcUrl = Deno.env.get("GROUP_CHAT_ANTISPAM_RPC_URL");
    if (rpcUrl) {
      try {
        const rpcResp = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [senderPubkey],
          }),
        });
        const rpcJson = await rpcResp.json();
        const lamports = Number(rpcJson?.result?.value ?? 0);
        if (!Number.isFinite(lamports) || lamports < GROUP_MIN_LAMPORTS) {
          return jsonResp(
            { error: "Group chat requires a funded wallet (≥ 0.001 SOL)" },
            403,
          );
        }
      } catch (err) {
        // Don't hard-fail on RPC blip — log and allow.
        console.warn("anti-spam balance check failed", err);
      }
    }
  }

  // 5. Per-sender rate limit across all threads.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: countErr } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_pubkey", senderPubkey)
    .gte("created_at", windowStart);
  if (countErr) return jsonResp({ error: countErr.message }, 500);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return jsonResp(
      { error: `Rate limit: ${RATE_LIMIT_MAX} messages per ${RATE_LIMIT_WINDOW_MS / 60_000} min` },
      429,
    );
  }

  // 6. Insert.
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
