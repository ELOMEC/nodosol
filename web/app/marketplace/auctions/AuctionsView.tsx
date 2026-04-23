"use client";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  auctionsProgram,
  fetchAllAuctions,
  OnChainAuction,
} from "@/lib/auctions";

type State =
  | { kind: "loading" }
  | { kind: "ready"; auctions: OnChainAuction[] }
  | { kind: "error"; message: string };

type Filter = "live" | "mine" | "past" | "all";

export function AuctionsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("live");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = auctionsProgram(provider);
      const auctions = await fetchAllAuctions(program);
      setState({ kind: "ready", auctions });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const me = publicKey?.toBase58();
    return state.auctions.filter((a) => {
      if (filter === "mine") return me && a.seller === me;
      if (filter === "past") return a.status === "settled" || a.status === "cancelled";
      if (filter === "all") return true;
      // live: not terminal, and still within reveal window
      return (
        a.status !== "settled" &&
        a.status !== "cancelled" &&
        now < a.revealEndsAt
      );
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [state, filter, publicKey, now]);

  return (
    <>
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.3rem" }}>
            Sealed-bid auctions
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", maxWidth: 720 }}>
            Commit a hash of your bid during the open window, reveal the plain
            bid after the deadline. Highest revealed bid wins — USDC + escrow
            settle atomically. Primitive reusable for tickets, RWA tokens, and
            real-estate rentals.
          </p>
        </div>
        <Link
          href="/marketplace/auctions/new"
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
          + Create auction
        </Link>
      </header>

      <Card>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(["live", "mine", "past", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: 6,
                border: filter === f ? "1px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
                background: filter === f ? "#eef2ff" : "var(--shell-card, #fff)",
                color: filter === f ? "#3730a3" : "var(--shell-fg, #111827)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      {state.kind === "loading" && <Card><Centered>Loading auctions…</Centered></Card>}
      {state.kind === "error" && <Card><Centered>Failed: {state.message}</Centered></Card>}
      {state.kind === "ready" && (
        visible.length === 0 ? (
          <Card>
            <Centered>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No auctions</div>
              <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.9rem" }}>
                {filter === "live"
                  ? "Nothing live right now."
                  : filter === "mine"
                  ? "You haven't created any auctions yet."
                  : "No results for this filter."}
              </div>
              {filter !== "live" ? (
                <button
                  onClick={() => setFilter("live")}
                  style={{
                    background: "var(--shell-card, #fff)",
                    border: "1px solid var(--shell-border, #e5e7eb)",
                    color: "#4338ca",
                    padding: "0.5rem 0.95rem",
                    borderRadius: 8,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Show live auctions
                </button>
              ) : null}
            </Centered>
          </Card>
        ) : (
          <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "0.85rem" }}>
            {visible.map((a) => (
              <AuctionCard key={a.address} auction={a} now={now} me={publicKey?.toBase58() ?? null} />
            ))}
          </div>
        )
      )}
    </>
  );
}

function AuctionCard({
  auction,
  now,
  me,
}: {
  auction: OnChainAuction;
  now: number;
  me: string | null;
}) {
  const phase = phaseFor(auction, now);
  const seconds =
    phase === "commit" ? auction.commitEndsAt - now
    : phase === "reveal" ? auction.revealEndsAt - now
    : 0;

  return (
    <Link
      href={`/marketplace/auctions/${auction.address}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          background: "var(--shell-card, #fff)",
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 12,
          padding: "0.95rem 1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.55rem",
          height: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <PhaseBadge phase={phase} />
          {me === auction.seller && (
            <span
              style={{
                fontSize: "0.66rem",
                padding: "0.1rem 0.45rem",
                borderRadius: 4,
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Yours
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.35 }}>
          {auction.memo || "(no memo)"}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#6b7280", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>Floor ${auction.startPriceUsdc.toFixed(2)}</span>
          <span>Min deposit ${auction.minDepositUsdc.toFixed(2)}</span>
          <span>{auction.bidCount} bids · {auction.revealedCount} revealed</span>
        </div>
        {phase !== "terminal" && (
          <div style={{ fontSize: "0.72rem", color: "#4338ca", fontWeight: 600 }}>
            {phase === "commit" ? "Commit window ends in " : "Reveal window ends in "}
            {formatDuration(seconds)}
          </div>
        )}
        {auction.status === "settled" && (
          <div style={{ fontSize: "0.72rem", color: "#065f46", fontWeight: 600 }}>
            Winner: {auction.highestBidder.slice(0, 6)}…{auction.highestBidder.slice(-4)} · ${auction.highestBidUsdc.toFixed(2)}
          </div>
        )}
        {auction.status === "cancelled" && (
          <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>Cancelled</div>
        )}
      </div>
    </Link>
  );
}

export function phaseFor(auction: OnChainAuction, now: number): "commit" | "reveal" | "settle-ready" | "terminal" {
  if (auction.status === "settled" || auction.status === "cancelled") return "terminal";
  if (now < auction.commitEndsAt) return "commit";
  if (now < auction.revealEndsAt) return "reveal";
  return "settle-ready";
}

function PhaseBadge({ phase }: { phase: "commit" | "reveal" | "settle-ready" | "terminal" }) {
  const palette = (() => {
    switch (phase) {
      case "commit": return { bg: "#eef2ff", fg: "#3730a3", label: "Commit open" };
      case "reveal": return { bg: "#fef3c7", fg: "#92400e", label: "Reveal open" };
      case "settle-ready": return { bg: "#ecfdf5", fg: "#065f46", label: "Settle ready" };
      case "terminal": return { bg: "#f3f4f6", fg: "#4b5563", label: "Ended" };
    }
  })();
  return (
    <span
      style={{
        fontSize: "0.66rem",
        padding: "0.12rem 0.55rem",
        borderRadius: 4,
        background: palette.bg,
        color: palette.fg,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {palette.label}
    </span>
  );
}

export function formatDuration(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.2rem",
        marginBottom: "0.85rem",
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
