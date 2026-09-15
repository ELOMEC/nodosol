import {
  createAuthedSupabaseClient,
  getSupabaseClient,
} from "./supabase";

export type CreatorProfileRow = {
  id: string;
  wallet_pubkey: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  twitter: string | null;
  website: string | null;
  discord: string | null;
  telegram: string | null;
  links: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type CreatorProfileWritable = Partial<
  Pick<
    CreatorProfileRow,
    | "handle"
    | "display_name"
    | "bio"
    | "avatar_url"
    | "banner_url"
    | "twitter"
    | "website"
    | "discord"
    | "telegram"
  >
> & { links?: Record<string, string> };

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,30}$/;

export function isValidHandle(s: string): boolean {
  return HANDLE_PATTERN.test(s);
}

export async function fetchProfileByHandle(
  handle: string
): Promise<CreatorProfileRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) {
    console.warn("fetchProfileByHandle failed", error);
    return null;
  }
  return (data as CreatorProfileRow | null) ?? null;
}

export async function fetchProfileByWallet(
  walletPubkey: string
): Promise<CreatorProfileRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("creator_profiles")
    .select("*")
    .eq("wallet_pubkey", walletPubkey)
    .maybeSingle();
  if (error) {
    console.warn("fetchProfileByWallet failed", error);
    return null;
  }
  return (data as CreatorProfileRow | null) ?? null;
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  if (!isValidHandle(handle)) return false;
  const existing = await fetchProfileByHandle(handle);
  return existing === null;
}

export type ListSort = "newest" | "recent" | "handle";

export type ListProfilesOpts = {
  query?: string;
  sort?: ListSort;
  /** 1-indexed page. */
  page?: number;
  pageSize?: number;
};

export type ListProfilesResult = {
  rows: CreatorProfileRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Lists public creator_profiles. Reads are RLS-public so the anon
 * client suffices. Uses Supabase `count: exact` so a single round-trip
 * returns rows + the matching total for pagination headers.
 */
export async function listProfiles(
  opts: ListProfilesOpts = {}
): Promise<ListProfilesResult> {
  const supabase = getSupabaseClient();
  const sort: ListSort = opts.sort ?? "newest";
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(60, Math.max(1, Math.floor(opts.pageSize ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("creator_profiles")
    .select("*", { count: "exact" })
    .range(from, to);

  if (opts.query && opts.query.trim()) {
    // Escape ILIKE wildcards in user input.
    const safe = opts.query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    const pattern = `%${safe}%`;
    q = q.or(`handle.ilike.${pattern},display_name.ilike.${pattern}`);
  }

  switch (sort) {
    case "recent":
      q = q.order("updated_at", { ascending: false });
      break;
    case "handle":
      q = q.order("handle", { ascending: true });
      break;
    case "newest":
    default:
      q = q.order("created_at", { ascending: false });
      break;
  }

  const { data, error, count } = await q;
  if (error) {
    console.warn("listProfiles failed", error);
    return { rows: [], total: 0, page, pageSize };
  }
  return {
    rows: (data ?? []) as CreatorProfileRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Insert or update the calling wallet's profile. Caller must provide a
 * Supabase-signed JWT (issue-chat-jwt Edge Function) so the row's
 * wallet_pubkey lines up with auth.jwt()->>'sub' for RLS.
 */
export async function upsertProfile(
  walletPubkey: string,
  jwt: string,
  patch: CreatorProfileWritable
): Promise<{ ok: true; row: CreatorProfileRow } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);

  const existing = await fetchProfileByWallet(walletPubkey);
  if (!existing) {
    if (!patch.handle) {
      return { ok: false, error: "Handle is required for new profile" };
    }
    if (!isValidHandle(patch.handle)) {
      return {
        ok: false,
        error: "Handle must be 2–31 chars: lowercase letters, digits, hyphen, underscore",
      };
    }
    const { data, error } = await supabase
      .from("creator_profiles")
      .insert({
        wallet_pubkey: walletPubkey,
        handle: patch.handle.toLowerCase(),
        display_name: patch.display_name ?? null,
        bio: patch.bio ?? null,
        avatar_url: patch.avatar_url ?? null,
        banner_url: patch.banner_url ?? null,
        twitter: patch.twitter ?? null,
        website: patch.website ?? null,
        discord: patch.discord ?? null,
        telegram: patch.telegram ?? null,
        links: patch.links ?? {},
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data as CreatorProfileRow };
  }

  if (patch.handle && patch.handle.toLowerCase() !== existing.handle) {
    if (!isValidHandle(patch.handle)) {
      return { ok: false, error: "Handle format invalid" };
    }
    const conflict = await fetchProfileByHandle(patch.handle);
    if (conflict && conflict.wallet_pubkey !== walletPubkey) {
      return { ok: false, error: "Handle is already taken" };
    }
  }

  const updateBody: Record<string, unknown> = {};
  for (const k of [
    "handle",
    "display_name",
    "bio",
    "avatar_url",
    "banner_url",
    "twitter",
    "website",
    "discord",
    "telegram",
    "links",
  ] as const) {
    if (k in patch) {
      const v = (patch as Record<string, unknown>)[k];
      updateBody[k] = k === "handle" && typeof v === "string" ? v.toLowerCase() : v;
    }
  }
  const { data, error } = await supabase
    .from("creator_profiles")
    .update(updateBody)
    .eq("wallet_pubkey", walletPubkey)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as CreatorProfileRow };
}
