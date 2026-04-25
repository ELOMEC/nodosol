"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { auctionsProgram, fetchAllAuctions, OnChainAuction } from "@/lib/auctions";
import {
  AuctionMetadata,
  fetchAuctionMetadata,
} from "@/lib/auctionMetadata";
import { USDC_UNIT } from "@/lib/constants";
import { fetchRentalMetadataBatch, RentalMetadata } from "@/lib/rentalMetadata";
import { subscriptionProgram } from "@/lib/subscription";

type PropertyKind = "auction" | "rental";

type PropertyCard = {
  kind: PropertyKind;
  href: string;
  title: string;
  priceLabel: string;
  priceUsdc: number;
  statusLabel: string;
  statusColor: { bg: string; fg: string };
  hero: string | null;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  sortScore: number;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; cards: PropertyCard[] }
  | { kind: "error"; message: string };

type Filter = "all" | "auction" | "rental";

export function PropertiesView() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
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

      const [auctions, rentalPlans] = await Promise.all([
        (async () => {
          const prog = auctionsProgram(provider);
          return fetchAllAuctions(prog);
        })(),
        (async () => {
          const prog = subscriptionProgram(provider);
          const api = (prog.account as Record<string, {
            all: () => Promise<Array<{
              publicKey: PublicKey;
              account: {
                creator: PublicKey;
                pricePerPeriod: BN;
                periodSeconds: BN;
                active: boolean;
                subscriberCount: BN;
                createdAt: BN;
              };
            }>>;
          }>).subscriptionPlan;
          return api.all();
        })(),
      ]);

      const rentalAddrs = rentalPlans.map((p) => p.publicKey.toBase58());
      const rentalMeta = await fetchRentalMetadataBatch(rentalAddrs);

      // Auction metadata pulled per-listing (URL stored on-chain).
      const auctionMeta = new Map<string, AuctionMetadata>();
      await Promise.all(
        auctions
          .filter((a) => a.metadataUri)
          .map(async (a) => {
            const m = await fetchAuctionMetadata(a.metadataUri);
            if (m) auctionMeta.set(a.address, m);
          })
      );

      const cards: PropertyCard[] = [];

      for (const a of auctions) {
        const meta = auctionMeta.get(a.address);
        if (!meta) continue; // skip auctions without enriched metadata
        cards.push(auctionCard(a, meta, now));
      }

      for (const p of rentalPlans) {
        const addr = p.publicKey.toBase58();
        const meta = rentalMeta.get(addr);
        if (!meta) continue; // skip non-rental plans
        cards.push(rentalCard(p, meta));
      }

      setState({ kind: "ready", cards });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, wallet, now]);

  // Initial load only — don't re-fetch every `now` tick.
  useEffect(() => {
    void load();
  }, [connection, wallet]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = query.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    return state.cards
      .filter((c) => (filter === "all" ? true : c.kind === filter))
      .filter((c) =>
        q
          ? c.title.toLowerCase().includes(q) ||
            (c.address?.toLowerCase().includes(q) ?? false) ||
            (c.city?.toLowerCase().includes(q) ?? false)
          : true
      )
      .filter((c) => {
        if (min !== null && !Number.isNaN(min) && c.priceUsdc < min) return false;
        if (max !== null && !Number.isNaN(max) && c.priceUsdc > max) return false;
        return true;
      })
      .sort((a, b) => b.sortScore - a.sortScore);
  }, [state, filter, query, priceMin, priceMax]);

  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.3rem" }}>
          Properties
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.88rem", maxWidth: 720 }}>
          Unified browse — sealed-bid auctions and recurring rentals with
          location metadata. Click a card to jump into the buy / bid / subscribe
          flow.
        </p>
      </header>

      <Card>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {(["all", "auction", "rental"] as Filter[]).map((f) => (
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
              {state.kind === "ready" && filter !== f && (
                <span style={{ marginLeft: "0.35rem", color: "#9ca3af", fontWeight: 500 }}>
                  {f === "all" ? state.cards.length : state.cards.filter((c) => c.kind === f).length}
                </span>
              )}
            </button>
          ))}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, address, or city…"
            style={{
              flex: 1,
              minWidth: 220,
              padding: "0.45rem 0.7rem",
              borderRadius: 7,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: "var(--shell-card, #fff)",
              color: "var(--shell-fg, #111827)",
              fontSize: "0.85rem",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem", color: "#6b7280" }}>
            <span>Price (USDC):</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              style={{ width: 80, padding: "0.4rem 0.55rem", borderRadius: 7, border: "1px solid var(--shell-border, #eef0f3)", background: "var(--shell-card, #fff)", color: "var(--shell-fg, #111827)", fontSize: "0.82rem" }}
            />
            <span style={{ color: "#9ca3af" }}>—</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="max"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              style={{ width: 80, padding: "0.4rem 0.55rem", borderRadius: 7, border: "1px solid var(--shell-border, #eef0f3)", background: "var(--shell-card, #fff)", color: "var(--shell-fg, #111827)", fontSize: "0.82rem" }}
            />
          </div>
        </div>
      </Card>

      {state.kind === "loading" && <Card><Centered>Loading properties…</Centered></Card>}
      {state.kind === "error" && <Card><Centered>{state.message}</Centered></Card>}
      {state.kind === "ready" && (
        visible.length === 0 ? (
          <Card>
            <Centered>
              <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>No matches</div>
              <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
                Try clearing the search, or widen the filter.
              </div>
            </Centered>
          </Card>
        ) : (
          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "0.85rem",
            }}
          >
            {visible.map((c) => (
              <PropertyCardTile key={c.href} card={c} />
            ))}
          </div>
        )
      )}
    </>
  );
}

function auctionCard(
  a: OnChainAuction,
  meta: AuctionMetadata,
  now: number
): PropertyCard {
  const isTerminal = a.status === "settled" || a.status === "cancelled";
  const phase =
    isTerminal ? "terminal"
    : now < a.commitEndsAt ? "commit"
    : now < a.revealEndsAt ? "reveal"
    : "settle";

  const { bg, fg, label } = (() => {
    if (phase === "commit") return { bg: "#eef2ff", fg: "#3730a3", label: "Commit open" };
    if (phase === "reveal") return { bg: "#fef3c7", fg: "#92400e", label: "Reveal open" };
    if (phase === "settle") return { bg: "#ecfdf5", fg: "#065f46", label: "Settle ready" };
    if (a.status === "settled") return { bg: "#f3f4f6", fg: "#4b5563", label: "Settled" };
    return { bg: "#f3f4f6", fg: "#4b5563", label: "Cancelled" };
  })();

  return {
    kind: "auction",
    href: `/marketplace/auctions/${a.address}`,
    title: meta.memo || a.memo,
    priceLabel: `Floor $${a.startPriceUsdc.toFixed(2)} · min bid ${a.minDepositUsdc.toFixed(2)}`,
    priceUsdc: a.startPriceUsdc,
    statusLabel: label,
    statusColor: { bg, fg },
    hero: meta.gallery?.[0] ?? null,
    address: meta.location?.address,
    lat: meta.location?.lat,
    lng: meta.location?.lng,
    // Sort: live auctions first, terminal last. Within live, earliest
    // deadline surfaces first (higher urgency = higher score).
    sortScore: isTerminal ? 0 : 1_000_000 - (a.commitEndsAt || a.revealEndsAt || 0),
  };
}

function rentalCard(
  p: {
    publicKey: PublicKey;
    account: {
      creator: PublicKey;
      pricePerPeriod: BN;
      periodSeconds: BN;
      active: boolean;
      subscriberCount: BN;
      createdAt: BN;
    };
  },
  meta: RentalMetadata
): PropertyCard {
  const price = Number(p.account.pricePerPeriod.toString()) / USDC_UNIT;
  const periodDays = Math.round(p.account.periodSeconds.toNumber() / 86400);
  const subs = p.account.subscriberCount.toNumber();
  return {
    kind: "rental",
    href: `/marketplace/rentals/${p.publicKey.toBase58()}`,
    title: meta.title,
    priceLabel: `$${price.toFixed(2)} / ${periodDays} day${periodDays === 1 ? "" : "s"}`,
    priceUsdc: price,
    statusLabel: p.account.active ? "Renting" : "Paused",
    statusColor: p.account.active
      ? { bg: "#dcfce7", fg: "#166534" }
      : { bg: "#fef3c7", fg: "#92400e" },
    hero: meta.gallery?.[0] ?? null,
    address: meta.location?.address,
    lat: meta.location?.lat,
    lng: meta.location?.lng,
    sortScore: (p.account.active ? 500_000 : 0) + subs,
  };
}

function PropertyCardTile({ card }: { card: PropertyCard }) {
  return (
    <Link
      href={card.href}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          background: "var(--shell-card, #fff)",
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div
          style={{
            height: 140,
            background: card.hero
              ? `center / cover no-repeat url(${card.hero})`
              : card.kind === "auction"
              ? "linear-gradient(135deg, #f59e0b, #dc2626)"
              : "linear-gradient(135deg, #4f46e5, #0ea5e9)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "flex",
              gap: "0.35rem",
            }}
          >
            <Pill
              label={card.kind === "auction" ? "Auction" : "Rental"}
              bg={card.kind === "auction" ? "#fef3c7" : "#dbeafe"}
              fg={card.kind === "auction" ? "#92400e" : "#1e40af"}
            />
            <Pill
              label={card.statusLabel}
              bg={card.statusColor.bg}
              fg={card.statusColor.fg}
            />
          </div>
        </div>
        <div style={{ padding: "0.85rem 1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.3 }}>{card.title}</div>
          {card.address && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>📍 {card.address}</div>
          )}
          <div style={{ fontSize: "0.82rem", fontWeight: 600, marginTop: "0.15rem" }}>{card.priceLabel}</div>
        </div>
      </div>
    </Link>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        fontSize: "0.62rem",
        padding: "0.1rem 0.5rem",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "0.85rem 1.05rem",
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
