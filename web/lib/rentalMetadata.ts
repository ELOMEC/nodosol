import { ASSET_MEDIA_BUCKET, getSupabaseClient } from "./supabase";
import type { LocationValue } from "../components/LocationPicker";

/**
 * Off-chain metadata keyed by the subscription plan PDA. The subscription
 * program doesn't carry a metadata URI on-chain, so clients look the
 * rental record up by PDA → <PDA>.json in the asset-media bucket.
 *
 * Field shape intentionally overlaps with AuctionMetadata so future
 * cross-surface indexers (e.g. a unified "properties" search) can parse
 * both.
 */
export type RentalMetadata = {
  /** Short headline — apartment / venue name. */
  title: string;
  description?: string;
  gallery?: string[];
  videoUrl?: string;
  location?: LocationValue;
  amenities?: string[];
  /** House rules, cancellation policy, anything landlord wants surfaced. */
  terms?: string;
  /** Whether prospective tenants may message the landlord from the listing
   *  page. Defaults to true when absent. */
  allowChat?: boolean;
  createdAt?: string;
};

function keyFor(planAddress: string): string {
  return `rental-metadata/${planAddress}.json`;
}

export async function uploadRentalMetadata(
  planAddress: string,
  metadata: RentalMetadata
): Promise<string> {
  const supabase = getSupabaseClient();
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(keyFor(planAddress), blob, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(keyFor(planAddress));
  return data.publicUrl;
}

export async function fetchRentalMetadata(
  planAddress: string
): Promise<RentalMetadata | null> {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(keyFor(planAddress));
  try {
    const resp = await fetch(data.publicUrl, { cache: "no-store" });
    if (!resp.ok) return null;
    return (await resp.json()) as RentalMetadata;
  } catch (err) {
    console.warn("rental metadata fetch failed", err);
    return null;
  }
}

export async function fetchRentalMetadataBatch(
  planAddresses: string[]
): Promise<Map<string, RentalMetadata>> {
  const out = new Map<string, RentalMetadata>();
  await Promise.all(
    planAddresses.map(async (addr) => {
      const m = await fetchRentalMetadata(addr);
      if (m) out.set(addr, m);
    })
  );
  return out;
}
