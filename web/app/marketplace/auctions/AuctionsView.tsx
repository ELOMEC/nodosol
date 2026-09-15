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
import { useSearchParamsState } from "@/lib/useSearchParamsState";
import { EmptyState } from "@/components/EmptyState";
import { MarketSearchBar } from "@/components/MarketSearchBar";

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
  const [filter, setFilter] = useSearchParamsState<Filter>("filter", "live", {
    allowed: ["live", "mine", "past", "all"] as const,
  });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [search, setSearch] = useSearchParamsState<string>("q", "", { debounceMs: 300 });
  const [priceMin, setPriceMin] = useSearchParamsState<string>("min", "", { debounceMs: 300 });
  const [priceMax, setPriceMax] = useSearchParamsState<string>("max", "", { debounceMs: 300 });
  const [sortKey, setSortKey] = useSearchParamsState<
    "newest" | "ending_soon" | "price_asc" | "price_desc"
  >("sort", "ending_soon", {
    allowed: ["newest", "ending_soon", "price_asc", "price_desc"] as const,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
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
    const q = search.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    return state.auctions
      .filter((a) => {
        if (filter === "mine") return me && a.seller === me;
        if (filter === "past") return a.status === "settled" || a.status === "cancelled";
        if (filter === "all") return true;
        return (
          a.status !== "settled" &&
          a.status !== "cancelled" &&
          now < a.revealEndsAt
        );
      })
      .filter((a) => {
        if (q && !a.memo.toLowerCase().includes(q) && !a.seller.toLowerCase().includes(q)) return false;
        if (min !== null && !Number.isNaN(min) && a.startPriceUsdc < min) return false;
        if (max !== null && !Number.isNaN(max) && a.startPriceUsdc > max) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "newest":
            return b.createdAt - a.createdAt;
          case "ending_soon": {
            const aEnd = a.status === "settled" || a.status === "cancelled" ? Number.MAX_SAFE_INTEGER : (now < a.commitEndsAt ? a.commitEndsAt : a.revealEndsAt);
            const bEnd = b.status === "settled" || b.status === "cancelled" ? Number.MAX_SAFE_INTEGER : (now < b.commitEndsAt ? b.commitEndsAt : b.revealEndsAt);
            return aEnd - bEnd;
          }
          case "price_asc":
            return a.startPriceUsdc - b.startPriceUsdc;
          case "price_desc":
            return b.startPriceUsdc - a.startPriceUsdc;
        }
      });
  }, [state, filter, publicKey, now, search, priceMin, priceMax, sortKey]);

  return (
    <>
      <header style={HERO}>
        <div>
          <span style={EYEBROW}>Sealed-bid market</span>
          <h1 style={H1}>
            Sealed-bid auctions
          </h1>
          <p style={SUB}>
            Commit a hash of your bid during the open window, reveal the plain
            bid after the deadline. Highest revealed bid wins — USDC + escrow
            settle atomically. Primitive reusable for tickets, RWA tokens, and
            real-estate rentals.
          </p>
        </div>
        <Link
          href="/marketplace/auctions/new"
          style={PRIMARY_LINK}
        >
          Create auction
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
                padding: "0.58rem 0.95rem",
                borderRadius: 999,
                border: filter === f ? "1px solid #0f172a" : "1px solid var(--shell-border, #eef0f3)",
                background: filter === f ? "#0f172a" : "#fff",
                color: filter === f ? "#fff" : "var(--shell-fg, #111827)",
                fontSize: "0.8rem",
                fontWeight: 800,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      <MarketSearchBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by memo or seller address…"
        priceMin={priceMin}
        priceMax={priceMax}
        onPriceMin={setPriceMin}
        onPriceMax={setPriceMax}
        priceLabel="Start price"
        sortKey={sortKey}
        onSort={setSortKey}
        sortOptions={[
          { value: "ending_soon", label: "Sort: Ending soon" },
          { value: "newest", label: "Sort: Newest" },
          { value: "price_asc", label: "Sort: Price ↑" },
          { value: "price_desc", label: "Sort: Price ↓" },
        ]}
        filteredCount={visible.length}
        totalCount={state.kind === "ready" ? state.auctions.length : 0}
        countLabel="auctions"
      />

      {state.kind === "loading" && <Card><Centered>Loading auctions…</Centered></Card>}
      {state.kind === "error" && <Card><Centered>Failed: {state.message}</Centered></Card>}
      {state.kind === "ready" && (
        visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="auctions"
              title={
                filter === "live"
                  ? "No live auctions right now"
                  : filter === "mine"
                  ? "You haven't started any auctions"
                  : "No auctions match this filter"
              }
              description={
                filter === "mine"
                  ? "Create your first sealed-bid auction — buyers commit a bid hash, then reveal in the second phase."
                  : "Sealed-bid auctions appear here once a seller posts one."
              }
              actions={[
                ...(filter === "mine"
                  ? [{ label: "Start an auction", href: "/marketplace/auctions/new", variant: "primary" as const }]
                  : []),
                ...(filter !== "live"
                  ? [{ label: "Show live auctions", onClick: () => setFilter("live"), variant: "secondary" as const }]
                  : []),
              ]}
            />
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
          borderRadius: 16,
          padding: "1.05rem 1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.55rem",
          height: "100%",
          boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <PhaseBadge phase={phase} />
          {me === auction.seller && (
            <span
              style={{
                fontSize: "0.66rem",
                padding: "0.1rem 0.45rem",
                borderRadius: 999,
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
        <div style={{ fontSize: "1rem", fontWeight: 800, lineHeight: 1.35 }}>
          {auction.memo || "(no memo)"}
        </div>
        <div style={{ fontSize: "0.76rem", color: "var(--shell-muted)", display: "flex", gap: "1rem", flexWrap: "wrap", fontWeight: 700 }}>
          <span>Floor ${auction.startPriceUsdc.toFixed(2)}</span>
          <span>Min deposit ${auction.minDepositUsdc.toFixed(2)}</span>
          <span>{auction.bidCount} bids · {auction.revealedCount} revealed</span>
        </div>
        {phase !== "terminal" && (
          <div style={{ fontSize: "0.72rem", color: "#0369a1", fontWeight: 800 }}>
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
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontWeight: 700,
        letterSpacing: "0.08em",
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
        borderRadius: 16,
        padding: "1rem 1.2rem",
        marginBottom: "0.85rem",
        boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
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

const HERO: React.CSSProperties = {
  marginBottom: "1rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1.25rem",
  flexWrap: "wrap",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 22,
  padding: "1.35rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,246,255,0.88))",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const EYEBROW: React.CSSProperties = {
  display: "inline-flex",
  marginBottom: "0.55rem",
  color: "#0369a1",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const H1: React.CSSProperties = {
  fontSize: "2.7rem",
  lineHeight: 1.05,
  letterSpacing: 0,
  fontWeight: 800,
  marginBottom: "0.45rem",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.98rem",
  lineHeight: 1.6,
  maxWidth: 760,
};

const PRIMARY_LINK: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  padding: "0.68rem 1rem",
  borderRadius: 999,
  fontSize: "0.85rem",
  fontWeight: 800,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
