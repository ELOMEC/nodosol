import { ASSET_MEDIA_BUCKET, getSupabaseClient } from "./supabase";

/**
 * Upload an event poster (PNG / JPG / SVG) to the public asset-media
 * bucket and return its public URL. Embedded in the Metaplex metadata
 * JSON that `create_event` points at.
 */
export async function uploadEventPoster(
  creatorPubkey: string,
  file: File
): Promise<string> {
  const supabase = getSupabaseClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const key = `event-posters/${creatorPubkey}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(key, file, { contentType: file.type || "image/png", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export type EventMetadata = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  /** Matches venue-templates.ts keys, or omit for custom Supabase layouts. */
  venueTemplate?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  /** Whether prospective ticket buyers may message the organiser from the
   *  event page. Defaults to true when absent. */
  allowChat?: boolean;
};

/**
 * Upload the Metaplex metadata JSON for an event and return the public URL.
 * The URL is what gets written on-chain in Event.metadata_uri (≤ 256 chars).
 *
 * Keyed by eventId so re-uploading with the same key is idempotent — use
 * a fresh eventId for drafts.
 */
export async function uploadEventMetadata(
  creatorPubkey: string,
  eventId: bigint,
  metadata: EventMetadata
): Promise<string> {
  const supabase = getSupabaseClient();
  const key = `event-metadata/${creatorPubkey}/${eventId.toString()}.json`;
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(key, blob, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}
