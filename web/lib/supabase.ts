import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://xvgxaodxylrolkpyuszx.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_J3YZ2Lpx2k3UUF3xBF_VSA_xLS7GR_D";

// Anon / publishable keys are safe to embed client-side. Env vars are preferred
// so the dev / staging projects can override without a rebuild.
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;
}

let clientSingleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (clientSingleton) return clientSingleton;
  clientSingleton = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  return clientSingleton;
}

export const ASSET_MEDIA_BUCKET = "asset-media";

/**
 * Uploads a file to the public asset-media bucket, returning its public URL.
 * Caller chooses the key (e.g. `${timestamp}-${slug}.jpg`).
 */
export async function uploadAssetMedia(
  key: string,
  body: Blob | File | ArrayBuffer,
  contentType: string
): Promise<string> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(ASSET_MEDIA_BUCKET)
    .upload(key, body, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(ASSET_MEDIA_BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export type AssetMetadataJson = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  properties?: {
    category: string;
    delivery_required: boolean;
  };
};

export type ChatMessage = {
  id: number;
  thread_memo_hash: string;
  sender_pubkey: string;
  body: string;
  created_at: string;
};

export type ChatThread = {
  memo_hash: string;
  seller_pubkey: string;
  buyer_pubkey: string;
  deal_address: string;
  created_at: string;
};
