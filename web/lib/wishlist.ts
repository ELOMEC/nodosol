import { createAuthedSupabaseClient } from "./supabase";

export type WishlistItemType =
  | "event"
  | "auction"
  | "rental"
  | "asset"
  | "listing";

export type WishlistRow = {
  wallet_pubkey: string;
  item_type: WishlistItemType;
  item_id: string;
  created_at: string;
};

const TABLE = "wishlist";

/** Raw fetch via the JWT-authed client (RLS gates to own rows). */
export async function fetchWishlist(jwt: string): Promise<WishlistRow[]> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { data, error } = await supabase
    .from(TABLE)
    .select("wallet_pubkey, item_type, item_id, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("fetchWishlist failed", error);
    return [];
  }
  return (data ?? []) as WishlistRow[];
}

export async function addToWishlist(
  jwt: string,
  wallet: string,
  itemType: WishlistItemType,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { error } = await supabase.from(TABLE).insert({
    wallet_pubkey: wallet,
    item_type: itemType,
    item_id: itemId,
  });
  if (error) {
    // Unique constraint violation = already in list; treat as success.
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeFromWishlist(
  jwt: string,
  wallet: string,
  itemType: WishlistItemType,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("wallet_pubkey", wallet)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Light-weight count for UI badges. Uses anon read which RLS denies —
 * but only the JWT-authed client returns rows. Exposing wallet
 * counts to anyone would leak interest signals; keep this private.
 */
export async function fetchWishlistCount(jwt: string): Promise<number> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

