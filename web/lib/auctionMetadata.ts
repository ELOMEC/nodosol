import { ASSET_MEDIA_BUCKET, getSupabaseClient } from "./supabase";
import type { LocationValue } from "../components/LocationPicker";

/**
 * Richer off-chain metadata an auction's `metadata_uri` points at.
 * The auctions program only knows about a short memo + opaque URI,
 * so everything else — gallery, video, location, long description —
 * lives here and is decoded client-side.
 */
export type AuctionMetadata = {
  /** Mirrors Auction.memo for quick preview when only the JSON is loaded. */
  memo: string;
  description?: string;
  gallery?: string[]; // public URLs
  videoUrl?: string;
  location?: LocationValue;
  /** ISO 8601 — when the seller published. */
  createdAt?: string;
};

export async function uploadAuctionMetadata(
  creatorPubkey: string,
  auctionId: bigint,
  metadata: AuctionMetadata
): Promise<string> {
  const supabase = getSupabaseClient();
  const key = `auction-metadata/${creatorPubkey}/${auctionId.toString()}.json`;
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(key, blob, { contentType: "application/json", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export async function fetchAuctionMetadata(uri: string): Promise<AuctionMetadata | null> {
  if (!uri) return null;
  try {
    const httpUri = uri.startsWith("ipfs://")
      ? uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
      : uri;
    const resp = await fetch(httpUri, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as AuctionMetadata;
  } catch (err) {
    console.warn("auction metadata fetch failed", err);
    return null;
  }
}
