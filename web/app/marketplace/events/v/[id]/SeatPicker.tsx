"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { isSeatAvailable, listSeats, SeatDoc } from "@/lib/seats";
import { rowLabelsFor, VenueLayoutRegion } from "@/lib/venueLayouts";

type Props = {
  eventPubkey: string;
  tierId: number;
  tierName: string;
  region: VenueLayoutRegion;
  busy: boolean;
  initialSelection?: { rowLabel: string; seatNumber: number };
  onCancel: () => void;
  onPick: (seat: { rowLabel: string; seatNumber: number }) => void;
  onShare?: (seat: { rowLabel: string; seatNumber: number }) => void;
};

export function SeatPicker({
  eventPubkey,
  tierId,
  tierName,
  region,
  busy,
  initialSelection,
  onCancel,
  onPick,
  onShare,
}: Props) {
  const [seats, setSeats] = useState<SeatDoc[] | null>(null);
  const [selected, setSelected] = useState<{ rowLabel: string; seatNumber: number } | null>(
    initialSelection ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const rows = region.rows ?? 0;
  const seatsPerRow = region.seatsPerRow ?? 0;
  const rowLabels = useMemo(() => rowLabelsFor(region), [region]);

  const load = useCallback(async () => {
    try {
      const data = await listSeats(eventPubkey, tierId);
      setSeats(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not load seats.");
    }
  }, [eventPubkey, tierId]);

  useEffect(() => {
    void load();
    // Refresh every 12s so seats others just grabbed or released update.
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [load]);

  const seatByKey = useMemo(() => {
    const m = new Map<string, SeatDoc>();
    for (const s of seats ?? []) m.set(`${s.rowLabel}:${s.seatNumber}`, s);
    return m;
  }, [seats]);

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1rem",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
          borderRadius: 14,
          maxWidth: 760,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "1.2rem 1.4rem",
          boxShadow: "0 18px 48px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, letterSpacing: 0 }}>
              Pick a seat — {tierName}
            </div>
            <div style={{ fontSize: "0.82rem", color: "#6b7280", marginTop: "0.2rem" }}>
              {rows} rows × {seatsPerRow} seats per row. Green = available, grey = taken, blue = your pick.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.3rem",
              color: "#6b7280",
              cursor: "pointer",
              padding: "0 0.3rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ padding: "0.6rem 0.8rem", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: "0.85rem", marginBottom: "0.75rem" }}>
            {error}
          </div>
        )}

        {seats === null && !error ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>Loading seats…</div>
        ) : (
          <div
            style={{
              background: "var(--shell-pill-bg, #f7f8fa)",
              borderRadius: 10,
              padding: "0.9rem 1rem",
              overflowX: "auto",
            }}
          >
            <div
              style={{
                display: "inline-grid",
                gridTemplateColumns: `auto repeat(${seatsPerRow}, 32px)`,
                gap: "6px",
                alignItems: "center",
              }}
            >
              <div />
              {Array.from({ length: seatsPerRow }, (_, s) => (
                <div
                  key={`h-${s}`}
                  style={{
                    textAlign: "center",
                    fontSize: "0.65rem",
                    color: "#9ca3af",
                    fontWeight: 600,
                  }}
                >
                  {s + 1}
                </div>
              ))}
              {rowLabels.map((rowLabel) => (
                <Row
                  key={rowLabel}
                  rowLabel={rowLabel}
                  seatsPerRow={seatsPerRow}
                  selected={selected}
                  seatByKey={seatByKey}
                  onClick={(seat) => setSelected(seat)}
                />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.88rem", color: "#111827" }}>
            {selected ? (
              <span>
                Selected: <strong>{selected.rowLabel}{selected.seatNumber}</strong>
              </span>
            ) : (
              <span style={{ color: "#6b7280" }}>Click a seat to continue.</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {onShare && (
              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && onShare(selected)}
                title="Copy a link that opens this seat pre-selected"
                style={{
                  padding: "0.5rem 0.9rem",
                  borderRadius: 7,
                  border: "1px solid var(--shell-border, #eef0f3)",
                  background: "var(--shell-card, #fff)",
                  color: selected ? "var(--shell-fg, #111827)" : "#9ca3af",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: selected ? "pointer" : "not-allowed",
                }}
              >
                Share seat
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 7,
                border: "1px solid var(--shell-border, #eef0f3)",
                background: "var(--shell-card, #fff)",
                color: "var(--shell-fg, #111827)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || busy}
              onClick={() => selected && onPick(selected)}
              style={{
                padding: "0.5rem 1.1rem",
                borderRadius: 7,
                border: "none",
                background: !selected || busy ? "#c7d2fe" : "#4f46e5",
                color: "#fff",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: !selected || busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Reserving + minting…" : "Buy this seat"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  rowLabel,
  seatsPerRow,
  selected,
  seatByKey,
  onClick,
}: {
  rowLabel: string;
  seatsPerRow: number;
  selected: { rowLabel: string; seatNumber: number } | null;
  seatByKey: Map<string, SeatDoc>;
  onClick: (seat: { rowLabel: string; seatNumber: number }) => void;
}) {
  return (
    <>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", paddingRight: "0.3rem" }}>
        {rowLabel}
      </div>
      {Array.from({ length: seatsPerRow }, (_, i) => {
        const seatNumber = i + 1;
        const key = `${rowLabel}:${seatNumber}`;
        const seat = seatByKey.get(key);
        const available = isSeatAvailable(seat);
        const isSelected = selected?.rowLabel === rowLabel && selected?.seatNumber === seatNumber;

        let bg = "#22c55e";
        let cursor: React.CSSProperties["cursor"] = "pointer";
        let title = `${rowLabel}${seatNumber} — available`;
        if (!available) {
          if (seat?.status === "minted") {
            bg = "#9ca3af";
            title = `${rowLabel}${seatNumber} — sold`;
          } else {
            bg = "#f59e0b";
            title = `${rowLabel}${seatNumber} — held by another buyer`;
          }
          cursor = "not-allowed";
        }
        if (isSelected) {
          bg = "#4f46e5";
          title = `${rowLabel}${seatNumber} — your selection`;
        }
        return (
          <button
            type="button"
            key={key}
            title={title}
            disabled={!available}
            onClick={() => onClick({ rowLabel, seatNumber })}
            style={{
              width: 32,
              height: 26,
              borderRadius: 5,
              border: isSelected ? "2px solid #312e81" : "none",
              background: bg,
              color: "#fff",
              fontSize: "0.6rem",
              fontWeight: 700,
              cursor,
              padding: 0,
            }}
          >
            {seatNumber}
          </button>
        );
      })}
    </>
  );
}
