// Supabase Edge Function: helius-webhook
//
// Receives Helius enhanced-transaction webhook payloads, decodes events
// for known Nodosol programs, and inserts per-wallet rows into the
// `notifications` table (migration 017).
//
// Setup (do once on production):
//   1. Apply migration 017 in Supabase SQL editor.
//   2. Deploy this function:
//        supabase functions deploy helius-webhook --no-verify-jwt
//   3. Set the function secret HELIUS_WEBHOOK_SECRET (random hex; used
//      to authenticate Helius hits) and SUPABASE_SERVICE_ROLE_KEY (auto-set).
//   4. In Helius dashboard, create an Enhanced Webhook:
//        - URL: https://<project-ref>.supabase.co/functions/v1/helius-webhook
//        - Auth header: Bearer <HELIUS_WEBHOOK_SECRET>
//        - Account addresses: paste the 9 program IDs from web/idl/*.json
//        - Type: enhanced
//
// Wallet targeting:
//   For each event we determine the affected wallet(s) from on-chain
//   accounts (e.g. tip recipient = creator profile owner; ticket buyer
//   = signer; auction settle = highest bidder + seller). One row per
//   target wallet — RLS partitions reads.
//
// Runtime: Deno.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bs58 from "https://esm.sh/bs58@5.0.0";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Pasted from web/idl/*.json — kept inline so the function is
// self-contained with no build step.
const PROGRAM_IDS: Record<string, string> = {
  tip_jar: "C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P",
  subscription: "8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w",
  events: "4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax",
  rwa_registry: "7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT",
  rwa_mint: "HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU",
  marketplace: "69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ",
  otc_deals: "FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz",
  event_tickets: "FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE",
  auctions: "6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v",
};

const PROGRAM_BY_ID = Object.fromEntries(
  Object.entries(PROGRAM_IDS).map(([k, v]) => [v, k])
);

type HeliusEnhancedTx = {
  signature: string;
  type: string; // e.g. "TRANSFER", "UNKNOWN"
  source: string; // program/source ID when known
  timestamp: number;
  slot: number;
  fee: number;
  feePayer: string;
  accountData?: Array<{ account: string; nativeBalanceChange: number }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
  instructions?: Array<{
    programId: string;
    accounts: string[];
    data: string;
    innerInstructions?: Array<{ programId: string; accounts: string[]; data: string }>;
  }>;
};

type NotificationRow = {
  wallet_pubkey: string;
  type: string;
  payload: Record<string, unknown>;
  href: string | null;
  title: string;
  body: string | null;
  signature: string | null;
  email_eligible: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // Authenticate Helius using a shared secret.
  const expectedSecret = Deno.env.get("HELIUS_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("HELIUS_WEBHOOK_SECRET not configured");
    return jsonError("Server misconfigured", 500);
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expectedSecret}`) {
    return jsonError("Unauthorized", 401);
  }

  let body: HeliusEnhancedTx[] | HeliusEnhancedTx;
  try {
    body = (await req.json()) as HeliusEnhancedTx[] | HeliusEnhancedTx;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const txs = Array.isArray(body) ? body : [body];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const rows: NotificationRow[] = [];
  for (const tx of txs) {
    const decoded = await decodeTx(tx);
    rows.push(...decoded);
  }

  if (rows.length === 0) {
    return jsonOk({ inserted: 0 });
  }

  const { error } = await supabase.from("notifications").upsert(rows, {
    onConflict: "wallet_pubkey,signature,type",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("notifications insert failed", error);
    return jsonError("Insert failed", 500);
  }

  return jsonOk({ inserted: rows.length });
});

// Anchor instruction discriminator = sha256("global:" + ix_name).slice(0, 8).
// Computed once at startup so the function dispatches in O(1).
const IX_NAMES_BY_PROGRAM: Record<string, string[]> = {
  tip_jar: ["send_tip"],
  subscription: ["subscribe", "charge", "expire", "cancel"],
  events: ["buy_ticket"],
  event_tickets: ["buy_ticket", "buy_tier_ticket", "buy_ticket_resale", "buy_ticket_resale_private"],
  marketplace: ["buy_listing"],
  otc_deals: ["propose_deal", "accept_deal", "cancel_deal", "expire_deal"],
  auctions: ["commit_bid", "reveal_bid", "settle_auction", "refund_bid"],
};

const DISCRIMINATORS: Map<string, { program: string; ix: string }> = new Map();
for (const [program, ixNames] of Object.entries(IX_NAMES_BY_PROGRAM)) {
  for (const ix of ixNames) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`global:${ix}`)
    );
    const discHex = Array.from(new Uint8Array(hash).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    DISCRIMINATORS.set(discHex, { program, ix });
  }
}

type DecodedIx = {
  program: string;
  ix: string;
  accounts: string[];
  programId: string;
};

function ixDataDiscriminator(dataB58: string): string | null {
  try {
    const bytes = bs58.decode(dataB58);
    if (bytes.length < 8) return null;
    return Array.from(bytes.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function decodeKnownIxes(tx: HeliusEnhancedTx): DecodedIx[] {
  const out: DecodedIx[] = [];
  const ixs = tx.instructions ?? [];
  for (const ix of ixs) {
    const programLabel = PROGRAM_BY_ID[ix.programId];
    if (!programLabel) continue;
    const disc = ixDataDiscriminator(ix.data);
    if (!disc) continue;
    const match = DISCRIMINATORS.get(disc);
    if (match && match.program === programLabel) {
      out.push({
        program: match.program,
        ix: match.ix,
        accounts: ix.accounts,
        programId: ix.programId,
      });
    }
  }
  return out;
}

/**
 * Walks a Helius enhanced tx, dispatches per-IX decoders, falls back
 * to generic token-transfer notifications for unrecognized flows.
 */
async function decodeTx(tx: HeliusEnhancedTx): Promise<NotificationRow[]> {
  const knownIxes = decodeKnownIxes(tx);
  const out: NotificationRow[] = [];
  const transfers = tx.tokenTransfers ?? [];

  // Per-IX decoders. Each emits 0..N rows.
  for (const ix of knownIxes) {
    const decoder = DECODERS[`${ix.program}.${ix.ix}`];
    if (decoder) {
      out.push(...(await decoder(tx, ix, transfers)));
    }
  }

  // If no specific decoder fired, fall back to generic token-transfer
  // notifications so the user still sees something.
  if (out.length === 0) {
    out.push(...genericTransferRows(tx, transfers));
  }

  return out;
}

// Sum of token transfers that landed in `dest` (matches by exact wallet).
function inflowTo(transfers: HeliusEnhancedTx["tokenTransfers"], dest: string): number {
  return (transfers ?? [])
    .filter((t) => t.toUserAccount === dest)
    .reduce((sum, t) => sum + t.tokenAmount, 0);
}

function outflowFrom(transfers: HeliusEnhancedTx["tokenTransfers"], src: string): number {
  return (transfers ?? [])
    .filter((t) => t.fromUserAccount === src)
    .reduce((sum, t) => sum + t.tokenAmount, 0);
}

type IxDecoder = (
  tx: HeliusEnhancedTx,
  ix: DecodedIx,
  transfers: HeliusEnhancedTx["tokenTransfers"]
) => NotificationRow[] | Promise<NotificationRow[]>;

// In-invocation cache for on-chain account fetches done from decoders
// (e.g. CreatorProfile.owner lookup for tip_received rows). Helius can
// deliver bursts of txs touching the same creator profile, so caching
// for ~5 minutes keeps the function from re-fetching each time. The
// Edge Function process is recycled by Supabase between cold starts,
// so this Map is per-instance and naturally bounded.
const ACCOUNT_FETCH_CACHE_TTL_MS = 5 * 60 * 1000;
const creatorOwnerCache = new Map<string, { owner: string | null; expiresAt: number }>();

/**
 * Fetches a tip_jar `CreatorProfile` PDA via JSON-RPC and returns the
 * `owner` Pubkey (the creator's wallet) as base58. Cached per-PDA for
 * `ACCOUNT_FETCH_CACHE_TTL_MS`. Returns null on missing account, decode
 * failure, or RPC error — caller treats null as "skip creator-side row".
 *
 * Account layout (from programs/tip_jar/src/state.rs):
 *   bytes 0..8   = Anchor discriminator
 *   bytes 8..40  = owner: Pubkey  ← what we read
 *   bytes 40..72 = mint: Pubkey
 */
async function fetchCreatorOwner(creatorProfilePda: string): Promise<string | null> {
  const now = Date.now();
  const cached = creatorOwnerCache.get(creatorProfilePda);
  if (cached && cached.expiresAt > now) {
    return cached.owner;
  }
  const rpcUrl = Deno.env.get("RPC_URL") ?? "https://api.devnet.solana.com";
  let owner: string | null = null;
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [creatorProfilePda, { encoding: "base64", commitment: "confirmed" }],
      }),
    });
    const json = await resp.json();
    const dataField = json?.result?.value?.data;
    const b64 = Array.isArray(dataField) ? dataField[0] : null;
    if (b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bytes.length >= 40) {
        owner = bs58.encode(bytes.slice(8, 40));
      }
    }
  } catch (e) {
    console.error("fetchCreatorOwner failed", creatorProfilePda, e);
  }
  creatorOwnerCache.set(creatorProfilePda, { owner, expiresAt: now + ACCOUNT_FETCH_CACHE_TTL_MS });
  return owner;
}

// Account positions per Anchor IX struct. Keep in sync with
// programs/<name>/src/instructions/<ix>.rs `#[derive(Accounts)]`.
const DECODERS: Record<string, IxDecoder> = {
  // tip_jar.send_tip: [tipper (signer), tipper_token_account, creator_profile (PDA), vault (PDA), ...]
  // Tip funds settle into the vault PDA so token-transfer recipients are
  // PDAs, not the creator wallet. To emit a creator-side row we resolve
  // creator_profile.owner via a one-shot getAccountInfo RPC, cached for
  // ~5 minutes per PDA inside this invocation (see fetchCreatorOwner).
  "tip_jar.send_tip": async (tx, ix, transfers) => {
    const donor = ix.accounts[0];
    const creatorProfile = ix.accounts[2];
    const amount = donor ? outflowFrom(transfers, donor) : 0;
    if (!donor) return [];
    const rows: NotificationRow[] = [
      {
        wallet_pubkey: donor,
        type: "tip_sent",
        payload: { amount, signature: tx.signature, creator_profile: creatorProfile },
        href: "/creator",
        title: amount > 0 ? `Tip sent: ${amount} USDC` : "Tip sent",
        body: null,
        signature: tx.signature,
        email_eligible: false,
      },
    ];
    if (creatorProfile) {
      const creator = await fetchCreatorOwner(creatorProfile);
      if (creator && creator !== donor) {
        rows.push({
          wallet_pubkey: creator,
          type: "tip_received",
          payload: { amount, signature: tx.signature, creator_profile: creatorProfile, donor },
          href: "/creator",
          title: amount > 0 ? `Tip received: ${amount} USDC` : "Tip received",
          body: null,
          signature: tx.signature,
          email_eligible: true,
        });
      }
    }
    return rows;
  },

  // subscription.charge: [cranker (signer), plan, subscription, subscriber_token_account, vault, mint, treasury, config, token_program]
  // Subscriber == owner of subscriber_token_account; we approximate via the
  // first non-PDA, non-cranker account that experienced an outflow.
  "subscription.charge": (tx, ix, transfers) => {
    const subscriberTokenAcct = ix.accounts[3];
    // Find the wallet that lost funds (subscriber).
    const subscriber = (transfers ?? []).find(
      (t) => t.fromUserAccount && t.fromUserAccount !== tx.feePayer
    )?.fromUserAccount;
    const amount = subscriber ? outflowFrom(transfers, subscriber) : 0;
    const rows: NotificationRow[] = [];
    if (subscriber) {
      rows.push({
        wallet_pubkey: subscriber,
        type: "subscription_charged",
        payload: { amount, signature: tx.signature, plan: ix.accounts[1] },
        href: "/marketplace/rentals/my",
        title: amount > 0 ? `Subscription charged: ${amount} USDC` : "Subscription charged",
        body: null,
        signature: tx.signature,
        email_eligible: true,
      });
    }
    return rows;
  },

  // subscription.expire: [cranker (signer), plan, subscription]
  // We can't recover subscriber from accounts alone (subscription is a PDA);
  // skip personalised rows — UI shows "Renting" → "Expired" status anyway
  // when reloading the page. Emit a single creator-side row using cranker.
  "subscription.expire": (tx, _ix, _transfers) => [
    {
      wallet_pubkey: tx.feePayer,
      type: "subscription_expired",
      payload: { signature: tx.signature },
      href: "/marketplace/rentals/my",
      title: "Subscription expired (grace period elapsed)",
      body: null,
      signature: tx.signature,
      email_eligible: true,
    },
  ],

  // marketplace.buy_listing: [buyer (signer), asset_mint, payment_mint, listing, vault, ...]
  // Seller wallet lives in listing.seller (PDA field) — derive from transfers:
  // the wallet receiving the payment_mint is the seller.
  "marketplace.buy_listing": (tx, ix, transfers) => {
    const buyer = ix.accounts[0];
    const paymentMint = ix.accounts[2];
    const buyerOutflow = buyer ? outflowFrom(transfers, buyer) : 0;
    const sellerCandidate = (transfers ?? []).find(
      (t) => t.mint === paymentMint && t.toUserAccount && t.toUserAccount !== buyer
    );
    const rows: NotificationRow[] = [
      {
        wallet_pubkey: buyer,
        type: "listing_bought",
        payload: { amount: buyerOutflow, signature: tx.signature, listing: ix.accounts[3] },
        href: "/marketplace/portfolio",
        title: buyerOutflow > 0 ? `Listing bought: ${buyerOutflow} USDC` : "Listing bought",
        body: null,
        signature: tx.signature,
        email_eligible: false,
      },
    ];
    if (sellerCandidate?.toUserAccount) {
      rows.push({
        wallet_pubkey: sellerCandidate.toUserAccount,
        type: "listing_sold",
        payload: { amount: sellerCandidate.tokenAmount, signature: tx.signature, buyer, listing: ix.accounts[3] },
        href: "/marketplace/assets",
        title: `Your listing sold: ${sellerCandidate.tokenAmount} USDC`,
        body: null,
        signature: tx.signature,
        email_eligible: true,
      });
    }
    return rows;
  },

  // otc_deals.propose_deal: [seller (signer), buyer, deal, ...]
  "otc_deals.propose_deal": (tx, ix, _transfers) => [
    {
      wallet_pubkey: ix.accounts[1], // buyer
      type: "otc_proposed",
      payload: { signature: tx.signature, deal: ix.accounts[2], seller: ix.accounts[0] },
      href: "/marketplace/otc",
      title: "OTC deal proposed to you",
      body: null,
      signature: tx.signature,
      email_eligible: true,
    },
  ],

  // otc_deals.accept_deal: [buyer (signer), asset_mint, payment_mint, deal, vault, ...]
  // Seller in deal.seller (PDA field) — derived via payment_mint inflow.
  "otc_deals.accept_deal": (tx, ix, transfers) => {
    const buyer = ix.accounts[0];
    const paymentMint = ix.accounts[2];
    const dealPda = ix.accounts[3];
    const buyerOutflow = buyer ? outflowFrom(transfers, buyer) : 0;
    const sellerCandidate = (transfers ?? []).find(
      (t) => t.mint === paymentMint && t.toUserAccount && t.toUserAccount !== buyer
    );
    const rows: NotificationRow[] = [
      {
        wallet_pubkey: buyer,
        type: "otc_accepted_self",
        payload: { signature: tx.signature, deal: dealPda, amount: buyerOutflow },
        href: "/marketplace/otc",
        title: `OTC deal closed: ${buyerOutflow} USDC paid`,
        body: null,
        signature: tx.signature,
        email_eligible: false,
      },
    ];
    if (sellerCandidate?.toUserAccount) {
      rows.push({
        wallet_pubkey: sellerCandidate.toUserAccount,
        type: "otc_accepted",
        payload: { signature: tx.signature, deal: dealPda, amount: sellerCandidate.tokenAmount, buyer },
        href: "/marketplace/otc",
        title: `OTC deal accepted: ${sellerCandidate.tokenAmount} USDC received`,
        body: null,
        signature: tx.signature,
        email_eligible: true,
      });
    }
    return rows;
  },

  // auctions.commit_bid: [bidder (signer), auction, bid, ...]
  "auctions.commit_bid": (tx, ix, _transfers) => [
    {
      wallet_pubkey: ix.accounts[0],
      type: "bid_committed",
      payload: { signature: tx.signature, auction: ix.accounts[1] },
      href: `/marketplace/auctions/${ix.accounts[1] ?? ""}`,
      title: "Bid committed (sealed)",
      body: null,
      signature: tx.signature,
      email_eligible: false,
    },
  ],

  // auctions.reveal_bid: [bidder (signer), auction, bid, ...]
  "auctions.reveal_bid": (tx, ix, _transfers) => [
    {
      wallet_pubkey: ix.accounts[0],
      type: "bid_revealed",
      payload: { signature: tx.signature, auction: ix.accounts[1] },
      href: `/marketplace/auctions/${ix.accounts[1] ?? ""}`,
      title: "Bid revealed",
      body: null,
      signature: tx.signature,
      email_eligible: false,
    },
  ],

  // auctions.settle_auction: [caller (signer), auction, winner_bid, ...]
  // Seller wallet from auction.seller (PDA field), winner from auction.highest_bidder.
  // Both not in account positions — we infer from token transfers: largest
  // payment_mint inflow = seller; outflow from a non-fee-payer wallet = winner.
  "auctions.settle_auction": (tx, ix, transfers) => {
    const auction = ix.accounts[1];
    const rows: NotificationRow[] = [];
    // Seller = largest payment-mint recipient.
    const sellerInflow = (transfers ?? [])
      .filter((t) => t.toUserAccount && t.toUserAccount !== tx.feePayer)
      .sort((a, b) => b.tokenAmount - a.tokenAmount)[0];
    if (sellerInflow?.toUserAccount) {
      rows.push({
        wallet_pubkey: sellerInflow.toUserAccount,
        type: "auction_settled_seller",
        payload: { signature: tx.signature, auction, price: sellerInflow.tokenAmount },
        href: `/marketplace/auctions/${auction ?? ""}`,
        title: `Your auction settled: ${sellerInflow.tokenAmount} USDC`,
        body: null,
        signature: tx.signature,
        email_eligible: true,
      });
    }
    return rows;
  },

  // event_tickets.buy_tier_ticket: [buyer (signer), event (PDA), tier (PDA), ...]
  // Ticket revenue lands in the event's vault PDA, not the creator's wallet,
  // so we can only emit a buyer-side row here. Creator-side notification
  // needs an RPC fetch of Event.creator (TODO).
  "event_tickets.buy_tier_ticket": (tx, ix, transfers) => {
    const buyer = ix.accounts[0];
    const eventPda = ix.accounts[1];
    const buyerOutflow = buyer ? outflowFrom(transfers, buyer) : 0;
    if (!buyer) return [];
    return [
      {
        wallet_pubkey: buyer,
        type: "ticket_bought",
        payload: { signature: tx.signature, event: eventPda, amount: buyerOutflow },
        href: "/marketplace/tickets",
        title: buyerOutflow > 0 ? `Ticket bought: ${buyerOutflow} USDC` : "Ticket bought",
        body: null,
        signature: tx.signature,
        email_eligible: false,
      },
    ];
  },

  // event_tickets.buy_ticket_resale: [buyer (signer), seller, ...]
  "event_tickets.buy_ticket_resale": (tx, ix, transfers) => {
    const buyer = ix.accounts[0];
    const seller = ix.accounts[1];
    const amount = buyer ? outflowFrom(transfers, buyer) : 0;
    return [
      {
        wallet_pubkey: buyer,
        type: "resale_bought",
        payload: { signature: tx.signature, amount },
        href: "/marketplace/tickets",
        title: amount > 0 ? `Resale ticket bought: ${amount} USDC` : "Resale ticket bought",
        body: null,
        signature: tx.signature,
        email_eligible: false,
      },
      {
        wallet_pubkey: seller,
        type: "resale_sold",
        payload: { signature: tx.signature, amount, buyer },
        href: "/marketplace/resale",
        title: `Resale ticket sold: ${amount} USDC`,
        body: null,
        signature: tx.signature,
        email_eligible: true,
      },
    ];
  },
};

// Conservative fallback for unrecognized IXes within Nodosol programs.
// Only emits inflow rows for wallets that are also signers/feePayer in the
// tx (i.e. real users, not vault/treasury PDAs). PDAs aren't signers, so
// this filters them out reliably.
function genericTransferRows(
  tx: HeliusEnhancedTx,
  transfers: HeliusEnhancedTx["tokenTransfers"]
): NotificationRow[] {
  const out: NotificationRow[] = [];
  const signers = new Set<string>([tx.feePayer]);
  for (const t of transfers ?? []) {
    if (t.toUserAccount && signers.has(t.toUserAccount)) {
      out.push({
        wallet_pubkey: t.toUserAccount,
        type: "token_inflow",
        payload: { amount: t.tokenAmount, mint: t.mint, signature: tx.signature },
        href: "/marketplace",
        title: `Received ${t.tokenAmount} tokens`,
        body: null,
        signature: tx.signature,
        email_eligible: false,
      });
    }
  }
  return out;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function jsonError(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
