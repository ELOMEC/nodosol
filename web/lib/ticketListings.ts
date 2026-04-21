import { getSupabaseClient } from "./supabase";

export type ListingStatus = "listed" | "sold_pending" | "sold" | "cancelled" | "expired";

export type TicketListingDoc = {
  id: string;
  assetId: string;
  eventPubkey: string;
  sellerPubkey: string;
  buyerPubkey: string | null;
  priceUsdcBase: number;
  settlementStatus: ListingStatus;
  paymentSig: string | null;
  transferSig: string | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  asset_id: string;
  event_pubkey: string;
  seller_pubkey: string;
  buyer_pubkey: string | null;
  price_usdc_base: number | string;
  settlement_status: ListingStatus;
  payment_sig: string | null;
  transfer_sig: string | null;
  note: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToDoc(r: Row): TicketListingDoc {
  return {
    id: r.id,
    assetId: r.asset_id,
    eventPubkey: r.event_pubkey,
    sellerPubkey: r.seller_pubkey,
    buyerPubkey: r.buyer_pubkey,
    priceUsdcBase: Number(r.price_usdc_base),
    settlementStatus: r.settlement_status,
    paymentSig: r.payment_sig,
    transferSig: r.transfer_sig,
    note: r.note,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listActiveListings(filters: {
  eventPubkey?: string;
  limit?: number;
} = {}): Promise<TicketListingDoc[]> {
  const supabase = getSupabaseClient();
  let q = supabase
    .from("ticket_listings")
    .select("*")
    .eq("settlement_status", "listed")
    .order("created_at", { ascending: false });
  if (filters.eventPubkey) q = q.eq("event_pubkey", filters.eventPubkey);
  q = q.limit(filters.limit ?? 100);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function listListingsForSeller(
  sellerPubkey: string
): Promise<TicketListingDoc[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ticket_listings")
    .select("*")
    .eq("seller_pubkey", sellerPubkey)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function getActiveListingForAsset(
  assetId: string
): Promise<TicketListingDoc | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ticket_listings")
    .select("*")
    .eq("asset_id", assetId)
    .eq("settlement_status", "listed")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDoc(data) : null;
}

export async function createListing(input: {
  assetId: string;
  eventPubkey: string;
  sellerPubkey: string;
  priceUsdcBase: bigint;
  note: string | null;
  expiresAt: string | null;
}): Promise<TicketListingDoc> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ticket_listings")
    .insert({
      asset_id: input.assetId,
      event_pubkey: input.eventPubkey,
      seller_pubkey: input.sellerPubkey,
      price_usdc_base: input.priceUsdcBase.toString(),
      note: input.note,
      expires_at: input.expiresAt,
      settlement_status: "listed",
    })
    .select()
    .single();
  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This ticket already has an active listing. Cancel it first.");
    }
    throw error;
  }
  return rowToDoc(data);
}

export async function cancelListing(id: string, sellerPubkey: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ticket_listings")
    .update({ settlement_status: "cancelled" })
    .eq("id", id)
    .eq("seller_pubkey", sellerPubkey)
    .eq("settlement_status", "listed");
  if (error) throw error;
}

/**
 * Called after the buyer's USDC transfer tx has landed. Flips the listing
 * to sold_pending and records the payment signature + buyer pubkey so the
 * seller sees it on their dashboard and can push the cNFT in Phantom.
 */
export async function markListingSoldPending(input: {
  id: string;
  buyerPubkey: string;
  paymentSig: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ticket_listings")
    .update({
      settlement_status: "sold_pending",
      buyer_pubkey: input.buyerPubkey,
      payment_sig: input.paymentSig,
    })
    .eq("id", input.id)
    .eq("settlement_status", "listed");
  if (error) throw error;
}

/** Seller confirms they've transferred the cNFT in Phantom. */
export async function markListingSold(input: {
  id: string;
  sellerPubkey: string;
  transferSig: string | null;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ticket_listings")
    .update({
      settlement_status: "sold",
      transfer_sig: input.transferSig,
    })
    .eq("id", input.id)
    .eq("seller_pubkey", input.sellerPubkey)
    .eq("settlement_status", "sold_pending");
  if (error) throw error;
}
