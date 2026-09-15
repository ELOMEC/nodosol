import { getSupabaseClient } from "./supabase";

export type SeatStatus = "reserved" | "minted";

export type SeatDoc = {
  id: number;
  eventPubkey: string;
  tierId: number;
  rowLabel: string;
  seatNumber: number;
  status: SeatStatus;
  ownerPubkey: string | null;
  mintSig: string | null;
  reservedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  event_pubkey: string;
  tier_id: number;
  row_label: string;
  seat_number: number;
  status: SeatStatus;
  owner_pubkey: string | null;
  mint_sig: string | null;
  reserved_until: string | null;
  created_at: string;
  updated_at: string;
};

function rowToSeat(r: Row): SeatDoc {
  return {
    id: r.id,
    eventPubkey: r.event_pubkey,
    tierId: r.tier_id,
    rowLabel: r.row_label,
    seatNumber: r.seat_number,
    status: r.status,
    ownerPubkey: r.owner_pubkey,
    mintSig: r.mint_sig,
    reservedUntil: r.reserved_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Reservation window — short so abandoned carts release quickly.
 * Tune up if users complain about losing seats while they read checkout.
 */
export const RESERVATION_TTL_MS = 3 * 60 * 1000;

export async function listSeats(
  eventPubkey: string,
  tierId: number
): Promise<SeatDoc[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tier_seats")
    .select("*")
    .eq("event_pubkey", eventPubkey)
    .eq("tier_id", tierId);
  if (error) throw error;
  return (data ?? []).map(rowToSeat);
}

/**
 * Treats a reserved seat whose `reserved_until` has passed as available.
 */
export function isSeatAvailable(seat: SeatDoc | undefined): boolean {
  if (!seat) return true;
  if (seat.status === "minted") return false;
  if (!seat.reservedUntil) return false;
  return new Date(seat.reservedUntil).getTime() < Date.now();
}

/**
 * Attempts to reserve a seat. Sweeps any expired reservation for the
 * (event, tier, row, seat) combination first so stale rows don't
 * permanently block the slot.
 *
 * Returns the reservation row on success. Throws on a live collision
 * (another user reserved this seat within the TTL).
 */
export async function reserveSeat(params: {
  eventPubkey: string;
  tierId: number;
  rowLabel: string;
  seatNumber: number;
  buyerPubkey: string;
}): Promise<SeatDoc> {
  const supabase = getSupabaseClient();
  const { eventPubkey, tierId, rowLabel, seatNumber, buyerPubkey } = params;

  // Sweep stale reservation (if any) for this exact seat.
  await supabase
    .from("tier_seats")
    .delete()
    .eq("event_pubkey", eventPubkey)
    .eq("tier_id", tierId)
    .eq("row_label", rowLabel)
    .eq("seat_number", seatNumber)
    .eq("status", "reserved")
    .lt("reserved_until", new Date().toISOString());

  const reservedUntil = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("tier_seats")
    .insert({
      event_pubkey: eventPubkey,
      tier_id: tierId,
      row_label: rowLabel,
      seat_number: seatNumber,
      status: "reserved",
      owner_pubkey: buyerPubkey,
      reserved_until: reservedUntil,
    })
    .select()
    .single();
  if (error) {
    // Most likely the unique constraint tripped — seat taken by a live
    // reservation or already minted. Surface a friendly message.
    throw new Error(`Seat ${rowLabel}${seatNumber} is no longer available.`);
  }
  return rowToSeat(data);
}

/**
 * Marks a previously-reserved seat as minted, attaching the mint
 * signature and final owner pubkey. Safe to call even if the
 * reservation expired between reserve and mint — promotes the row
 * anyway based on the unique seat identity.
 */
export async function confirmSeatMint(params: {
  eventPubkey: string;
  tierId: number;
  rowLabel: string;
  seatNumber: number;
  ownerPubkey: string;
  mintSig: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("tier_seats")
    .update({
      status: "minted",
      owner_pubkey: params.ownerPubkey,
      mint_sig: params.mintSig,
      reserved_until: null,
    })
    .eq("event_pubkey", params.eventPubkey)
    .eq("tier_id", params.tierId)
    .eq("row_label", params.rowLabel)
    .eq("seat_number", params.seatNumber);
  if (error) throw error;
}

/** Drops a reservation — used when the buyer abandons or the mint fails. */
export async function releaseReservation(params: {
  eventPubkey: string;
  tierId: number;
  rowLabel: string;
  seatNumber: number;
}): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from("tier_seats")
    .delete()
    .eq("event_pubkey", params.eventPubkey)
    .eq("tier_id", params.tierId)
    .eq("row_label", params.rowLabel)
    .eq("seat_number", params.seatNumber)
    .eq("status", "reserved");
}
