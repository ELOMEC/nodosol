// Supabase Edge Function: auction-reminders
//
// Hourly cron that finds active auctions whose `reveal_ends_at` is
// within 24h and inserts an `auction_ending_soon` notification for
// every bidder who has committed but not yet revealed.
//
// Why a cron and not a Helius webhook: webhooks fire on transactions;
// the "reveal window starts in <24h" event has no corresponding tx.
// Time-driven reminders need a poll.
//
// Dedupe: notifications.unique constraint on (wallet_pubkey, signature,
// type) — we set `signature = <auction_pda>` so the same auction can
// only fire one `auction_ending_soon` row per bidder, total. If we
// later want a 2h follow-up reminder we'd append a discriminator to
// the signature (e.g. `<pda>:T-2h`).
//
// Setup (do once):
//   supabase functions deploy auction-reminders --no-verify-jwt
//   Schedule via pg_cron — apply supabase/024_auction_reminders_cron.sql
//
// Runtime: Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const AUCTIONS_PROGRAM_ID = "6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v";

// Reminder window: 24h ± 1h slack so a transient missed cron run
// (e.g. Supabase platform maintenance) still catches the auction
// before reveal opens.
const REMINDER_WINDOW_START_S = 23 * 60 * 60;
const REMINDER_WINDOW_END_S = 25 * 60 * 60;

// Anchor account discriminators are sha256("account:" + name)[..8].
// Computed at runtime so we don't ship a precomputed-bytes table that
// can drift if the Anchor program renames an account.
async function accountDiscriminator(name: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(`account:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hash, 0, 8);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBs58Memcmp(hex: string): { bytes: string } {
  // memcmp filter for getProgramAccounts wants base58-encoded bytes.
  // Defer the bs58 import — Deno esm.sh has it.
  // We construct a literal Uint8Array from hex and reuse bs58.encode.
  // Use dynamic import to keep cold-start light.
  // (Inlined below in fetchProgramAccounts.)
  throw new Error("not used directly; see encodeBytes");
}

// JSON-RPC helpers — we hit Solana directly to avoid Anchor dependency
// in Deno (anchor-spl + bn.js are heavy + finicky on Deno).
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result: T; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

type ProgramAccount = {
  pubkey: string;
  account: { data: [string, "base64"]; lamports: number; owner: string };
};

async function getProgramAccounts(
  rpcUrl: string,
  programId: string,
  filters: Array<{ memcmp?: { offset: number; bytes: string }; dataSize?: number }>,
): Promise<ProgramAccount[]> {
  return rpcCall<ProgramAccount[]>(rpcUrl, "getProgramAccounts", [
    programId,
    {
      encoding: "base64",
      filters,
    },
  ]);
}

// bs58 import lazily — we encode an 8-byte discriminator for filters.
async function bs58Encode(bytes: Uint8Array): Promise<string> {
  const mod = await import("https://esm.sh/bs58@5.0.0");
  return mod.default.encode(bytes);
}

// Read u64 little-endian from a base64 string at offset.
function readU64Le(b64: string, offset: number): bigint {
  const bin = atob(b64);
  let v = 0n;
  for (let i = 7; i >= 0; i--) {
    v = (v << 8n) | BigInt(bin.charCodeAt(offset + i));
  }
  return v;
}

// Read a 32-byte pubkey (raw bytes → base58 string).
async function readPubkey(b64: string, offset: number): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = bin.charCodeAt(offset + i);
  return bs58Encode(bytes);
}

// Read a 1-byte enum tag.
function readU8(b64: string, offset: number): number {
  return atob(b64).charCodeAt(offset);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rpcUrl = Deno.env.get("RPC_URL") ?? "https://api.devnet.solana.com";
  if (!supabaseUrl || !serviceKey) {
    console.error("auction-reminders misconfigured: missing SUPABASE_URL/SERVICE_ROLE_KEY");
    return jsonError("Server misconfigured", 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Find Auction accounts in the reminder window.
  // Anchor account layout: 8-byte discriminator + 32 seller + 8 auction_id +
  // 32 mint + 32 vault + 8 start_price + 8 min_deposit + 8 created_at +
  // 8 commit_ends_at + 8 reveal_ends_at + 1 status + 4 bid_count +
  // 4 revealed_count + 8 highest_bid + 32 highest_bidder + ...
  // Offsets: reveal_ends_at = 8+32+8+32+32+8+8+8+8 = 144. status = 152.
  // bid_count = 153. revealed_count = 157.
  const REVEAL_ENDS_AT_OFFSET = 144;
  const STATUS_OFFSET = 152;
  const BID_COUNT_OFFSET = 153;
  const REVEALED_COUNT_OFFSET = 157;

  let auctions: ProgramAccount[];
  try {
    const auctionDisc = await accountDiscriminator("Auction");
    const discBs58 = await bs58Encode(auctionDisc);
    auctions = await getProgramAccounts(rpcUrl, AUCTIONS_PROGRAM_ID, [
      { memcmp: { offset: 0, bytes: discBs58 } },
    ]);
  } catch (err) {
    console.error("getProgramAccounts(auctions) failed", err);
    return jsonError("RPC failed", 502);
  }

  const now = Math.floor(Date.now() / 1000);
  const eligible: Array<{ pda: string; data: string; bidCount: number }> = [];
  for (const a of auctions) {
    const data = a.account.data[0];
    const status = readU8(data, STATUS_OFFSET);
    // 0=CommitPhase, 1=RevealPhase, 2=Settled, 3=Cancelled.
    // Reminder is for live auctions still in commit phase whose reveal
    // window opens in 23–25h — i.e. give bidders a heads-up to set a
    // reminder before commit closes.
    if (status > 1) continue;
    const revealAt = Number(readU64Le(data, REVEAL_ENDS_AT_OFFSET));
    const delta = revealAt - now;
    if (delta < REMINDER_WINDOW_START_S || delta > REMINDER_WINDOW_END_S) continue;
    const bidCount = Number(BigInt(readBytes(data, BID_COUNT_OFFSET, 4))); // u32 LE
    if (bidCount === 0) continue;
    const revealedCount = Number(BigInt(readBytes(data, REVEALED_COUNT_OFFSET, 4)));
    if (revealedCount >= bidCount) continue; // everyone already revealed
    eligible.push({ pda: a.pubkey, data, bidCount });
  }

  if (eligible.length === 0) {
    return jsonOk({ scanned: auctions.length, eligible: 0, inserted: 0 });
  }

  // 2. For each eligible auction, fetch SealedBid accounts whose
  // `auction` field == auction_pda AND `status == Committed`.
  // SealedBid layout: 8 disc + 32 auction + 32 bidder + 32 commit +
  // 8 escrow + 8 revealed_bid + 8 committed_at + 8 revealed_at +
  // 1 status + ...
  // memcmp offset 8 = auction; offset 8+32=40 = bidder.
  const SEALED_BID_AUCTION_OFFSET = 8;
  const SEALED_BID_BIDDER_OFFSET = 40;
  const SEALED_BID_STATUS_OFFSET = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8;

  let inserted = 0;
  const sealedBidDisc = await accountDiscriminator("SealedBid");
  const sealedBidDiscBs58 = await bs58Encode(sealedBidDisc);

  for (const { pda } of eligible) {
    let bids: ProgramAccount[];
    try {
      bids = await getProgramAccounts(rpcUrl, AUCTIONS_PROGRAM_ID, [
        { memcmp: { offset: 0, bytes: sealedBidDiscBs58 } },
        { memcmp: { offset: SEALED_BID_AUCTION_OFFSET, bytes: pda } },
      ]);
    } catch (err) {
      console.warn(`SealedBid fetch failed for ${pda}`, err);
      continue;
    }

    for (const b of bids) {
      const status = readU8(b.account.data[0], SEALED_BID_STATUS_OFFSET);
      if (status !== 0) continue; // 0 = Committed, 1 = Revealed
      const bidder = await readPubkey(b.account.data[0], SEALED_BID_BIDDER_OFFSET);

      const { error } = await admin.from("notifications").insert({
        wallet_pubkey: bidder,
        type: "auction_ending_soon",
        title: "Reveal opens in ~24h",
        body: "Set a reminder to reveal your sealed bid before the window closes.",
        href: `/marketplace/auctions/${pda}`,
        signature: pda, // dedupe key: one reminder per bidder per auction
        email_eligible: true,
        payload: { auction: pda, bid: b.pubkey },
      });
      if (error) {
        // 23505 = unique violation = already reminded → fine, skip.
        if (error.code !== "23505") {
          console.warn(`notify ${bidder} for ${pda} failed:`, error.message);
        }
      } else {
        inserted++;
      }
    }
  }

  return jsonOk({
    scanned: auctions.length,
    eligible: eligible.length,
    inserted,
  });
});

function readBytes(b64: string, offset: number, length: number): string {
  const bin = atob(b64);
  let hex = "0x";
  for (let i = length - 1; i >= 0; i--) {
    hex += bin.charCodeAt(offset + i).toString(16).padStart(2, "0");
  }
  return hex;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
