"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  deleteVenueLayout,
  listVenueLayoutsByCreator,
  VenueLayoutDoc,
} from "@/lib/venueLayouts";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; layouts: VenueLayoutDoc[] }
  | { kind: "error"; message: string };

export function VenueLayoutsView() {
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<State>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const layouts = await listVenueLayoutsByCreator(publicKey.toBase58());
      setState({ kind: "ready", layouts });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  async function remove(id: string) {
    if (!window.confirm("Delete this layout? Events linked to it will lose their venue.")) return;
    try {
      await deleteVenueLayout(id);
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Venue layouts
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem" }}>
            Draw custom floor plans and reuse them across events. Each zone maps to a ticket tier; tiers are priced per-event.
          </p>
        </div>
        <Link
          href="/creator/venues/new"
          style={{
            background: "#4f46e5",
            color: "#fff",
            padding: "0.55rem 1.1rem",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + New layout
        </Link>
      </header>

      {!connected ? (
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Connect the creator wallet to manage layouts.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      ) : state.kind === "loading" ? (
        <Card><Centered>Loading layouts…</Centered></Card>
      ) : state.kind === "error" ? (
        <Card><Centered>Failed: {state.message}</Centered></Card>
      ) : state.kind === "ready" ? (
        state.layouts.length === 0 ? (
          <Card>
            <Centered>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No custom layouts yet</div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
                Start from scratch by drawing zones, or continue using one of the four built-in venue templates.
              </div>
              <Link
                href="/creator/venues/new"
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Draw a venue →
              </Link>
            </Centered>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {state.layouts.map((l) => (
              <LayoutCard key={l.id} layout={l} onDelete={() => void remove(l.id)} />
            ))}
          </div>
        )
      ) : null}
    </>
  );
}

function LayoutCard({
  layout,
  onDelete,
}: {
  layout: VenueLayoutDoc;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ background: "var(--shell-pill-bg, #f7f8fa)", aspectRatio: "4/3", position: "relative" }}>
        <svg viewBox={layout.viewBox} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {layout.stageD && (
            <path d={layout.stageD} fill="#1f2937" opacity={0.7} />
          )}
          {layout.regions.map((r, idx) => (
            <path
              key={`${r.tierRef}-${idx}`}
              d={r.d}
              fill={r.defaultColor ?? "#4f46e5"}
              fillOpacity={0.45}
              stroke={r.defaultColor ?? "#4f46e5"}
              strokeWidth={2}
            />
          ))}
        </svg>
      </div>
      <div style={{ padding: "0.9rem 1.05rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{layout.name}</div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          {layout.regions.length} zones · updated {new Date(layout.updatedAt).toLocaleDateString()}
        </div>
        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.55rem" }}>
          <Link
            href={`/creator/venues/${layout.id}`}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 6,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: "var(--shell-pill-bg, #f7f8fa)",
              color: "var(--shell-fg, #111827)",
              fontSize: "0.78rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={onDelete}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 6,
              border: "1px solid #fecaca",
              background: "transparent",
              color: "#b91c1c",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.2rem",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}
