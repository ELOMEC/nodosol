/**
 * cNFT names minted via buy_tier_ticket follow:
 *   "{event} · {tier}"                (general admission)
 *   "{event} · {tier} · {row}{seat}"  (seated, e.g. "B4F · VIP · A7")
 *
 * Names are truncated on-chain to 32 chars, so fields can be partial.
 * This parser is best-effort — returns null when it can't find a seat
 * suffix rather than guessing.
 */
export type ParsedTicketSeat = {
  rowLabel: string;
  seatNumber: number;
  /** The raw "A7"-style suffix as found in the name. */
  raw: string;
};

const SEAT_REGEX = /^([A-Z]{1,4})(\d{1,5})$/i;

export function parseSeatFromName(name: string): ParsedTicketSeat | null {
  if (!name) return null;
  const parts = name.split("·").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1];
  const m = SEAT_REGEX.exec(last);
  if (!m) return null;
  const rowLabel = m[1].toUpperCase();
  const seatNumber = parseInt(m[2], 10);
  if (!Number.isFinite(seatNumber) || seatNumber <= 0) return null;
  return { rowLabel, seatNumber, raw: `${rowLabel}${seatNumber}` };
}

/**
 * Returns the tier portion of the name — second segment when split on "·".
 * Useful for labelling without re-fetching tier account.
 */
export function parseTierLabelFromName(name: string): string | null {
  if (!name) return null;
  const parts = name.split("·").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts[1];
}
