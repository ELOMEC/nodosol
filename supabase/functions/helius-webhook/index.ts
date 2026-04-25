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
    const decoded = decodeTx(tx);
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

/**
 * Walks a Helius enhanced tx and emits notification rows.
 *
 * Decoding strategy: identify which Nodosol program ran, look at token
 * transfers + signer + writable accounts to figure out the affected
 * wallet(s), and emit short headlines. Token-amount + mint give us
 * enough to render "$N tip received" without re-deserializing IX data.
 */
function decodeTx(tx: HeliusEnhancedTx): NotificationRow[] {
  const ixs = tx.instructions ?? [];
  const programs = new Set<string>();
  for (const ix of ixs) {
    const known = PROGRAM_BY_ID[ix.programId];
    if (known) programs.add(known);
    for (const inner of ix.innerInstructions ?? []) {
      const innerKnown = PROGRAM_BY_ID[inner.programId];
      if (innerKnown) programs.add(innerKnown);
    }
  }
  if (programs.size === 0) return [];

  const out: NotificationRow[] = [];
  const transfers = tx.tokenTransfers ?? [];

  // Heuristic: any token transfer where to/from is a wallet (not PDA)
  // gets an event for that wallet. Caller decoders below override with
  // higher-fidelity copy when they recognize the IX.
  for (const t of transfers) {
    if (t.fromUserAccount && t.fromUserAccount !== tx.feePayer) {
      out.push({
        wallet_pubkey: t.fromUserAccount,
        type: "token_outflow",
        payload: { amount: t.tokenAmount, mint: t.mint, signature: tx.signature },
        href: `/marketplace`,
        title: `Sent ${t.tokenAmount} tokens`,
        body: null,
        signature: tx.signature,
        email_eligible: false,
      });
    }
    if (t.toUserAccount) {
      out.push({
        wallet_pubkey: t.toUserAccount,
        type: programs.has("tip_jar") ? "tip_received" : "token_inflow",
        payload: { amount: t.tokenAmount, mint: t.mint, signature: tx.signature, programs: [...programs] },
        href: programs.has("tip_jar") ? `/creator` : `/marketplace`,
        title: programs.has("tip_jar")
          ? `Tip received: ${t.tokenAmount} USDC`
          : `Received ${t.tokenAmount} tokens`,
        body: null,
        signature: tx.signature,
        email_eligible: programs.has("tip_jar"),
      });
    }
  }

  // TODO: per-program rich decoding — read accounts[] positions per IX
  // and emit specific notifications:
  //  - subscription.charge → notify subscriber + creator
  //  - auctions.settle_auction → notify winner + seller
  //  - event_tickets.buy_tier_ticket → notify buyer (their cNFT) + creator
  //  - otc_deals.accept_deal → notify both parties
  //  - marketplace.buy_listing → notify buyer + seller

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
