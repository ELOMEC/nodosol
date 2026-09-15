import { getSupabaseClient } from "./supabase";

export type CheckInDoc = {
  id: number;
  eventPubkey: string;
  assetId: string;
  tierId: number | null;
  rowLabel: string | null;
  seatNumber: number | null;
  ownerPubkey: string | null;
  checkedInBy: string;
  checkedInAt: string;
};

type Row = {
  id: number;
  event_pubkey: string;
  asset_id: string;
  tier_id: number | null;
  row_label: string | null;
  seat_number: number | null;
  owner_pubkey: string | null;
  checked_in_by: string;
  checked_in_at: string;
};

function rowToDoc(r: Row): CheckInDoc {
  return {
    id: r.id,
    eventPubkey: r.event_pubkey,
    assetId: r.asset_id,
    tierId: r.tier_id,
    rowLabel: r.row_label,
    seatNumber: r.seat_number,
    ownerPubkey: r.owner_pubkey,
    checkedInBy: r.checked_in_by,
    checkedInAt: r.checked_in_at,
  };
}

export async function getCheckIn(assetId: string): Promise<CheckInDoc | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("check_ins")
    .select("*")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDoc(data) : null;
}

export async function listCheckInsForEvent(
  eventPubkey: string,
  limit = 40
): Promise<CheckInDoc[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("check_ins")
    .select("*")
    .eq("event_pubkey", eventPubkey)
    .order("checked_in_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function insertCheckIn(input: {
  eventPubkey: string;
  assetId: string;
  tierId: number | null;
  rowLabel: string | null;
  seatNumber: number | null;
  ownerPubkey: string | null;
  checkedInBy: string;
}): Promise<CheckInDoc> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("check_ins")
    .insert({
      event_pubkey: input.eventPubkey,
      asset_id: input.assetId,
      tier_id: input.tierId,
      row_label: input.rowLabel,
      seat_number: input.seatNumber,
      owner_pubkey: input.ownerPubkey,
      checked_in_by: input.checkedInBy,
    })
    .select()
    .single();
  if (error) {
    // Unique violation — already checked in.
    if (String(error.code) === "23505") {
      throw new Error("DUPLICATE");
    }
    throw error;
  }
  return rowToDoc(data);
}

export async function deleteCheckIn(assetId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("check_ins").delete().eq("asset_id", assetId);
  if (error) throw error;
}

/**
 * Extract the asset ID from either a raw ID or a nodosol ticket URL
 * (`/marketplace/tickets/<id>` or absolute URL). Returns null if nothing
 * that looks like a base58 identifier is present.
 */
export function extractAssetId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // URL form — take the last path segment.
  if (s.includes("/")) {
    const parts = s.split("?")[0].split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(last)) return last;
    return null;
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return s;
  return null;
}
