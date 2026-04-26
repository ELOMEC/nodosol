import { createAuthedSupabaseClient } from "./supabase";

/**
 * Per-wallet email + notification-type preferences.
 *
 * Backed by the `notification_preferences` table (migration 017 + 020).
 * Reads + writes go through the JWT-authed Supabase client so the row
 * is gated by `auth.jwt()->>'sub' = wallet_pubkey` RLS.
 *
 * Token columns (`email_verification_token`, `email_verification_sent_at`)
 * are set by the verify-email Edge Function (Sprint F2) and not part of
 * the writable surface here — clients only ever read them to render the
 * "Verify your email" CTA.
 */

export type NotificationPrefsRow = {
  wallet_pubkey: string;
  email: string | null;
  email_verified_at: string | null;
  email_types: string;
  email_verification_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPrefsWritable = {
  email: string | null;
  email_types: string;
};

/** Email types the dispatcher recognises today (helius-webhook decoders). */
export const EMAIL_TYPE_GROUPS: Array<{
  label: string;
  description: string;
  types: Array<{ key: string; label: string; help?: string }>;
}> = [
  {
    label: "Money in",
    description: "When something settles in your favour.",
    types: [
      { key: "tip_received", label: "Tip received" },
      { key: "subscription_revenue", label: "Subscription charged" },
      { key: "ticket_sold", label: "Event ticket sold" },
      { key: "listing_sold", label: "Marketplace listing sold" },
      { key: "resale_sold", label: "Resold ticket sold" },
      { key: "auction_settled_seller", label: "Auction settled (seller)" },
      { key: "bid_revealed", label: "Sealed bid revealed" },
      { key: "otc_accepted", label: "OTC deal accepted" },
    ],
  },
  {
    label: "Activity",
    description: "Things that need your attention.",
    types: [
      { key: "subscription_expired", label: "A subscriber lapsed" },
      { key: "otc_proposed", label: "Someone proposed an OTC deal" },
    ],
  },
  {
    label: "Confirmations",
    description: "Receipts for actions you took yourself.",
    types: [
      { key: "tip_sent", label: "Tip sent" },
      { key: "subscription_charged", label: "Your subscription was charged" },
      { key: "ticket_bought", label: "Event ticket purchased" },
      { key: "listing_bought", label: "Marketplace listing purchased" },
      { key: "resale_bought", label: "Resold ticket purchased" },
      { key: "bid_committed", label: "Sealed bid committed" },
      { key: "otc_accepted_self", label: "Your OTC counter accepted" },
    ],
  },
];

export const ALL_EMAIL_TYPES: string[] = EMAIL_TYPE_GROUPS.flatMap((g) =>
  g.types.map((t) => t.key)
);

/** Email types flagged email_eligible by the helius-webhook decoders. */
export const EMAIL_ELIGIBLE_DEFAULT_TYPES: string[] = [
  "tip_received",
  "subscription_revenue",
  "ticket_sold",
  "listing_sold",
  "resale_sold",
  "auction_settled_seller",
  "bid_revealed",
  "otc_accepted",
  "subscription_expired",
  "otc_proposed",
];

export function parseEmailTypes(csv: string): Set<string> {
  const trimmed = csv.trim();
  if (trimmed === "") return new Set();
  if (trimmed === "*") return new Set(ALL_EMAIL_TYPES);
  return new Set(
    trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function serializeEmailTypes(set: Set<string>): string {
  if (set.size === 0) return "";
  if (set.size === ALL_EMAIL_TYPES.length) return "*";
  return Array.from(set).join(",");
}

export async function fetchPrefs(
  jwt: string
): Promise<NotificationPrefsRow | null> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "wallet_pubkey, email, email_verified_at, email_types, email_verification_sent_at, created_at, updated_at"
    )
    .maybeSingle();
  if (error) {
    console.warn("fetchPrefs failed", error);
    return null;
  }
  return (data as NotificationPrefsRow | null) ?? null;
}

export type UpsertResult =
  | { ok: true; row: NotificationPrefsRow }
  | { ok: false; error: string };

export async function upsertPrefs(
  wallet: string,
  jwt: string,
  patch: NotificationPrefsWritable
): Promise<UpsertResult> {
  const supabase = createAuthedSupabaseClient(jwt);
  const normalisedEmail =
    patch.email?.trim().toLowerCase() || null;
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        wallet_pubkey: wallet,
        email: normalisedEmail,
        email_types: patch.email_types,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_pubkey" }
    )
    .select(
      "wallet_pubkey, email, email_verified_at, email_types, email_verification_sent_at, created_at, updated_at"
    )
    .single();
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, row: data as NotificationPrefsRow };
}

/** Trivial RFC-5322-ish check — final validation lives on the Edge Function. */
export function isValidEmail(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
