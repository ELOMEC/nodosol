import { createAuthedSupabaseClient } from "./supabase";

export type PriceAlertRow = {
  id: string;
  wallet_pubkey: string;
  query: string | null;
  max_price_usdc: number | null;
  category: string | null;
  last_matched_listing: string | null;
  last_matched_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PriceAlertWritable = {
  query?: string | null;
  max_price_usdc?: number | null;
  category?: string | null;
  active?: boolean;
};

const TABLE = "price_alerts";

export async function fetchPriceAlerts(jwt: string): Promise<PriceAlertRow[]> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("fetchPriceAlerts failed", error);
    return [];
  }
  return (data ?? []) as PriceAlertRow[];
}

export async function createPriceAlert(
  jwt: string,
  wallet: string,
  patch: PriceAlertWritable,
): Promise<{ ok: true; row: PriceAlertRow } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);
  const insertRow = {
    wallet_pubkey: wallet,
    query: patch.query?.trim() || null,
    max_price_usdc: patch.max_price_usdc ?? null,
    category: patch.category?.trim() || null,
    active: patch.active ?? true,
  };
  if (!insertRow.query && insertRow.max_price_usdc == null && !insertRow.category) {
    return { ok: false, error: "Set at least one of query / max price / category." };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertRow)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as PriceAlertRow };
}

export async function deletePriceAlert(
  jwt: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPriceAlertActive(
  jwt: string,
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAuthedSupabaseClient(jwt);
  const { error } = await supabase.from(TABLE).update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
