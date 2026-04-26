"use client";

import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import auctionsIdl from "@/idl/auctions.json";
import eventTicketsIdl from "@/idl/event_tickets.json";
import tipJarIdl from "@/idl/tip_jar.json";

import { getSupabaseClient } from "@/lib/supabase";

const REFRESH_MS = 60_000;
const TOP_CREATORS = 3;
const TOP_AUCTIONS = 3;
const TOP_EVENTS = 5;

class ReadOnlyWallet {
  readonly payer = Keypair.generate();
  readonly publicKey = this.payer.publicKey;
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T) {
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]) {
    return txs;
  }
}

function programInstance(idl: unknown, provider: AnchorProvider): Program {
  return new Program(idl as Idl, provider);
}

type CreatorEntry = {
  owner: string;
  totalTipCount: number;
  totalTipsAmount: number;
  // Joined from creator_profiles.
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type AuctionEntry = {
  pda: string;
  seller: string;
  startPrice: number;
  highestBid: number;
  revealEndsAt: number;
  bidCount: number;
  isReveal: boolean;
};

type EventEntry = {
  pda: string;
  creator: string;
  name: string;
  sold: number;
  capacity: number;
  startsAt: number;
  updatedAt: number;
};

type Trending = {
  creators: CreatorEntry[];
  auctions: AuctionEntry[];
  events: EventEntry[];
  loadedAt: number;
};

async function loadTrending(connection: Connection): Promise<Trending> {
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });

  const tipJar = programInstance(tipJarIdl, provider);
  const auctions = programInstance(auctionsIdl, provider);
  const eventTickets = programInstance(eventTicketsIdl, provider);

  type Account<T> = { account: T; publicKey: { toBase58(): string } };

  type RawCreator = {
    owner: { toBase58(): string };
    totalTipCount: BN;
    totalTipsAmount: BN;
  };
  type RawAuction = {
    seller: { toBase58(): string };
    startPrice: BN;
    highestBid: BN;
    commitEndsAt: BN;
    revealEndsAt: BN;
    bidCount: number;
    status: Record<string, unknown>;
  };
  type RawEvent = {
    creator: { toBase58(): string };
    name: string;
    sold: BN;
    capacity: BN;
    startsAt: BN;
    updatedAt: BN;
    status: Record<string, unknown>;
  };

  const safeAll = async <T,>(
    program: Program,
    accountName: string
  ): Promise<Account<T>[]> => {
    try {
      const api = (program.account as Record<string, { all: () => Promise<unknown[]> }>)[accountName];
      if (!api) return [];
      return ((await api.all()) as Account<T>[]) ?? [];
    } catch {
      return [];
    }
  };

  const [rawCreators, rawAuctions, rawEvents] = await Promise.all([
    safeAll<RawCreator>(tipJar, "creatorProfile"),
    safeAll<RawAuction>(auctions, "auction"),
    safeAll<RawEvent>(eventTickets, "event"),
  ]);

  // Top creators by total tips (lifetime). The `this week` framing isn't
  // expressible without historical data, so we lean on lifetime tip count
  // — recency bias kicks in naturally as new tips raise the count.
  const creatorRows = rawCreators
    .map((c) => ({
      owner: c.account.owner.toBase58(),
      totalTipCount: Number(c.account.totalTipCount?.toString?.() ?? 0),
      totalTipsAmount: Number(c.account.totalTipsAmount?.toString?.() ?? 0),
    }))
    .filter((r) => r.totalTipCount > 0)
    .sort((a, b) => b.totalTipCount - a.totalTipCount)
    .slice(0, TOP_CREATORS);

  // Decorate with handle/display_name from creator_profiles.
  const ownerSet = creatorRows.map((c) => c.owner);
  const profileMap = await fetchProfileMap(ownerSet);
  const creatorEntries: CreatorEntry[] = creatorRows.map((c) => {
    const p = profileMap.get(c.owner);
    return {
      ...c,
      handle: p?.handle ?? null,
      displayName: p?.display_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
    };
  });

  // Live auctions ending soon: status CommitPhase or RevealPhase, sort by
  // reveal_ends_at ascending. Phase is encoded as Anchor enum (object
  // with a single key) — we treat any non-Settled/Cancelled status as live.
  const now = Math.floor(Date.now() / 1000);
  const auctionEntries: AuctionEntry[] = rawAuctions
    .map((a) => ({
      pda: a.publicKey.toBase58(),
      seller: a.account.seller.toBase58(),
      startPrice: Number(a.account.startPrice?.toString?.() ?? 0),
      highestBid: Number(a.account.highestBid?.toString?.() ?? 0),
      revealEndsAt: Number(a.account.revealEndsAt?.toString?.() ?? 0),
      bidCount: Number(a.account.bidCount ?? 0),
      isReveal:
        Number(a.account.commitEndsAt?.toString?.() ?? 0) <= now,
      status: a.account.status,
    }))
    .filter((a) => {
      const s = a.status ?? {};
      const live = !("settled" in s) && !("cancelled" in s);
      return live && a.revealEndsAt > now;
    })
    .sort((a, b) => a.revealEndsAt - b.revealEndsAt)
    .slice(0, TOP_AUCTIONS);

  // Recent ticket sales: events with sold > 0, sort by updatedAt desc.
  const eventEntries: EventEntry[] = rawEvents
    .map((e) => ({
      pda: e.publicKey.toBase58(),
      creator: e.account.creator.toBase58(),
      name: e.account.name,
      sold: Number(e.account.sold?.toString?.() ?? 0),
      capacity: Number(e.account.capacity?.toString?.() ?? 0),
      startsAt: Number(e.account.startsAt?.toString?.() ?? 0),
      updatedAt: Number(e.account.updatedAt?.toString?.() ?? 0),
    }))
    .filter((e) => e.sold > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, TOP_EVENTS);

  return {
    creators: creatorEntries,
    auctions: auctionEntries,
    events: eventEntries,
    loadedAt: Date.now(),
  };
}

type ProfileLite = {
  wallet_pubkey: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
};

async function fetchProfileMap(wallets: string[]): Promise<Map<string, ProfileLite>> {
  if (wallets.length === 0) return new Map();
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("creator_profiles")
      .select("wallet_pubkey, handle, display_name, avatar_url")
      .in("wallet_pubkey", wallets);
    const map = new Map<string, ProfileLite>();
    for (const row of (data ?? []) as ProfileLite[]) {
      map.set(row.wallet_pubkey, row);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function TrendingPanel() {
  const { connection } = useConnection();
  const [data, setData] = useState<Trending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await loadTrending(connection);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trending");
    } finally {
      setBusy(false);
    }
  }, [connection]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div style={WRAP}>
      <header style={HEADER}>
        <h2 style={H2}>Trending now</h2>
        <span style={SUB}>
          {busy && !data ? "Loading…" : data ? `Updated ${secondsAgo(data.loadedAt)}` : ""}
        </span>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      <div style={GRID}>
        <Section title="Top creators" emptyHint="Tip activity will surface here.">
          {data?.creators.length
            ? data.creators.map((c) => <CreatorRow key={c.owner} c={c} />)
            : null}
        </Section>

        <Section title="Auctions ending soon" emptyHint="No live auctions yet.">
          {data?.auctions.length
            ? data.auctions.map((a) => <AuctionRow key={a.pda} a={a} />)
            : null}
        </Section>

        <Section title="Recent ticket sales" emptyHint="No ticketed events selling yet.">
          {data?.events.length
            ? data.events.map((e) => <EventRow key={e.pda} e={e} />)
            : null}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  emptyHint,
  children,
}: {
  title: string;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : children ? [children] : [];
  return (
    <div style={SECTION}>
      <div style={SECTION_TITLE}>{title}</div>
      {arr.length === 0 ? (
        <div style={EMPTY_HINT}>{emptyHint}</div>
      ) : (
        <ul style={LIST}>{arr}</ul>
      )}
    </div>
  );
}

function CreatorRow({ c }: { c: CreatorEntry }) {
  const display = c.displayName?.trim() || (c.handle ? `@${c.handle}` : shortPubkey(c.owner));
  const initials = display.replace(/^@/, "").slice(0, 2).toUpperCase();
  const href = c.handle ? `/c/${c.handle}` : "#";
  return (
    <li style={ROW}>
      <Link href={href} style={ROW_LINK}>
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.avatarUrl} alt="" style={AVATAR} />
        ) : (
          <span style={AVATAR_INITIALS}>{initials}</span>
        )}
        <span style={ROW_PRIMARY}>{display}</span>
        <span style={ROW_META}>{c.totalTipCount} tip{c.totalTipCount === 1 ? "" : "s"}</span>
      </Link>
    </li>
  );
}

function AuctionRow({ a }: { a: AuctionEntry }) {
  const usdc = a.highestBid > 0 ? a.highestBid : a.startPrice;
  return (
    <li style={ROW}>
      <Link href={`/marketplace/auctions/${a.pda}`} style={ROW_LINK}>
        <span style={ROW_BULLET} />
        <span style={ROW_PRIMARY}>
          {shortPubkey(a.seller)} · {a.bidCount} bid{a.bidCount === 1 ? "" : "s"}
        </span>
        <span style={ROW_META}>
          {(usdc / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC ·
          {" "}
          {a.isReveal ? "reveal" : "commit"} ends {timeUntil(a.revealEndsAt)}
        </span>
      </Link>
    </li>
  );
}

function EventRow({ e }: { e: EventEntry }) {
  return (
    <li style={ROW}>
      <Link href={`/marketplace/events/v/${e.pda}`} style={ROW_LINK}>
        <span style={ROW_BULLET} />
        <span style={ROW_PRIMARY}>{e.name || "Event"}</span>
        <span style={ROW_META}>
          {e.sold}/{e.capacity || "∞"} sold
        </span>
      </Link>
    </li>
  );
}

function shortPubkey(p: string): string {
  return p.length > 8 ? `${p.slice(0, 4)}…${p.slice(-4)}` : p;
}

function timeUntil(unixSec: number): string {
  const diff = unixSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  if (diff < 60) return `in ${diff}s`;
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  return `in ${Math.floor(diff / 86400)}d`;
}

function secondsAgo(loadedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - loadedAt) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

const WRAP: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 12,
  padding: "1.4rem 1.4rem 1.25rem",
};

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "1rem",
};

const H2: React.CSSProperties = {
  fontSize: "0.88rem",
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#9a9a9a",
  fontWeight: 600,
};

const SUB: React.CSSProperties = {
  fontSize: "0.74rem",
  color: "#6a6a6a",
};

const ERROR: React.CSSProperties = {
  color: "#ff8a8a",
  fontSize: "0.82rem",
  marginBottom: "0.85rem",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.85rem",
};

const SECTION: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #1f1f1f",
  borderRadius: 10,
  padding: "0.95rem 1rem 0.85rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#d4d4d4",
};

const EMPTY_HINT: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "#6a6a6a",
};

const LIST: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const ROW: React.CSSProperties = {
  background: "transparent",
};

const ROW_LINK: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  alignItems: "center",
  gap: "0.55rem",
  textDecoration: "none",
  color: "#e8e8e8",
  fontSize: "0.84rem",
  padding: "0.32rem 0",
};

const AVATAR: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  objectFit: "cover" as const,
  border: "1px solid #2a2a2a",
};

const AVATAR_INITIALS: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "rgba(123,156,255,0.18)",
  color: "#bcd",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.62rem",
  fontWeight: 700,
};

const ROW_BULLET: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#7b9cff",
};

const ROW_PRIMARY: React.CSSProperties = {
  fontWeight: 500,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
};

const ROW_META: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "#8a8a8a",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
};
