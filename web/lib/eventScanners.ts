import { getSupabaseClient } from "./supabase";

export type EventScannerDoc = {
  id: number;
  eventPubkey: string;
  scannerPubkey: string;
  label: string | null;
  addedBy: string;
  addedAt: string;
};

type Row = {
  id: number;
  event_pubkey: string;
  scanner_pubkey: string;
  label: string | null;
  added_by: string;
  added_at: string;
};

function rowToDoc(r: Row): EventScannerDoc {
  return {
    id: r.id,
    eventPubkey: r.event_pubkey,
    scannerPubkey: r.scanner_pubkey,
    label: r.label,
    addedBy: r.added_by,
    addedAt: r.added_at,
  };
}

export async function listScannersForEvent(
  eventPubkey: string
): Promise<EventScannerDoc[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("event_scanners")
    .select("*")
    .eq("event_pubkey", eventPubkey)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function addScanner(input: {
  eventPubkey: string;
  scannerPubkey: string;
  label: string | null;
  addedBy: string;
}): Promise<EventScannerDoc> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("event_scanners")
    .insert({
      event_pubkey: input.eventPubkey,
      scanner_pubkey: input.scannerPubkey,
      label: input.label,
      added_by: input.addedBy,
    })
    .select()
    .single();
  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This wallet is already a scanner for this event.");
    }
    throw error;
  }
  return rowToDoc(data);
}

export async function removeScanner(id: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("event_scanners").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Returns true if the given wallet is either the event creator
 * or a registered scanner for this event.
 */
export function isWalletAuthorised(
  walletPubkey: string,
  eventCreator: string,
  scanners: EventScannerDoc[]
): boolean {
  if (walletPubkey === eventCreator) return true;
  return scanners.some((s) => s.scannerPubkey === walletPubkey);
}
