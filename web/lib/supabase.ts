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

/**
 * Builds a Supabase client whose every REST request carries the given
 * chat JWT as Authorization. Used by ChatPanel so thread/message reads
 * and realtime subscribes go through the wallet-signed JWT instead of
 * the anon key. Each chat session gets its own instance so JWT refresh
 * simply swaps clients.
 */
export function createAuthedSupabaseClient(jwt: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * POSTs the signed wallet challenge to the issue-chat-jwt Edge Function
 * and returns the minted Supabase JWT + its expiry (unix seconds).
 */
export async function requestChatJwt(params: {
  wallet: string;
  message: string;
  signatureBase58: string;
}): Promise<{ jwt: string; expiresAt: number }> {
  const resp = await fetch(`${getSupabaseUrl()}/functions/v1/issue-chat-jwt`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: getSupabaseAnonKey(),
      authorization: `Bearer ${getSupabaseAnonKey()}`,
    },
    body: JSON.stringify({
      wallet: params.wallet,
      message: params.message,
      signature: params.signatureBase58,
    }),
  });
  if (!resp.ok) {
    const payload = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload?.error ?? `JWT issue failed (HTTP ${resp.status})`);
  }
  return (await resp.json()) as { jwt: string; expiresAt: number };
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
  /** Multi-image gallery — public URLs. image[0] (the `image` field) is the cover. */
  gallery?: string[];
  /** External video walkthrough (YouTube / Vimeo / direct MP4). */
  videoUrl?: string;
  /** Geographic metadata for physical / real-estate assets. */
  location?: {
    address: string;
    lat: number;
    lng: number;
    polygon?: Array<{ lat: number; lng: number }>;
  };
  properties?: {
    category: string;
    delivery_required: boolean;
    /** Sale mode the tokenizer intends — display only; listings live in their own program. */
    sale_mode?: "fixed" | "first_come" | "auction" | "private_commit" | "rental";
    /** Whether prospective buyers may message the owner from the asset
     *  page. Defaults to true when absent. */
    allow_chat?: boolean;
  };
};

/** Shared helper: interprets a listing's chat preference. Default ON. */
export function isChatAllowed(
  meta:
    | { allowChat?: boolean }
    | { properties?: { allow_chat?: boolean } }
    | null
    | undefined,
): boolean {
  if (!meta) return true;
  if ("allowChat" in meta && typeof meta.allowChat === "boolean") {
    return meta.allowChat;
  }
  if (
    "properties" in meta &&
    meta.properties &&
    typeof meta.properties.allow_chat === "boolean"
  ) {
    return meta.properties.allow_chat;
  }
  return true;
}

export type ChatMessage = {
  id: number;
  thread_memo_hash: string;
  sender_pubkey: string;
  body: string;
  created_at: string;
};

export type ChatThread = {
  memo_hash: string;
  thread_type: "otc_deal" | "listing_dm" | "group";
  seller_pubkey: string | null;
  buyer_pubkey: string | null;
  deal_address: string | null;
  channel_slug: string | null;
  listing_context: { kind: string; listing_pda: string } | null;
  created_at: string;
};

/**
 * Discriminated reference to a chat thread. Fed into ChatPanel so one
 * component can render OTC deals, per-listing DMs, and public group
 * channels.
 *
 * memoHash is the row's primary key. For OTC it's the on-chain memo_hash;
 * for listing_dm and group it's derived deterministically (see helpers
 * below) so both client and Edge Function can compute the same value.
 */
export type ChatThreadRef =
  | {
      kind: "otc_deal";
      memoHash: string;
      sellerPubkey: string;
      buyerPubkey: string;
      dealAddress: string;
    }
  | {
      kind: "listing_dm";
      memoHash: string;
      sellerPubkey: string;
      buyerPubkey: string;
      listingKind: "event" | "rental" | "auction" | "asset";
      listingPda: string;
    }
  | {
      kind: "group";
      memoHash: string;
      channelSlug: string;
    };

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives the listing_dm memo_hash. The Edge Function recomputes this
 * from the threadContext — if they disagree, the write is rejected.
 * Party order is min/max-lexicographic so buyer and seller land on the
 * same thread regardless of who initiates.
 */
export async function deriveListingMemoHash(
  listingKind: "event" | "rental" | "auction" | "asset",
  listingPda: string,
  partyA: string,
  partyB: string,
): Promise<string> {
  const [lo, hi] = partyA < partyB ? [partyA, partyB] : [partyB, partyA];
  return sha256Hex(`listing:${listingKind}:${listingPda}:${lo}:${hi}`);
}

/** Mirrors migration 014's seed hash. */
export async function deriveGroupMemoHash(channelSlug: string): Promise<string> {
  return sha256Hex(`group:${channelSlug}`);
}
