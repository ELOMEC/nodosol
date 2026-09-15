"use client";

import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  ConfirmedSignatureInfo,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import tipJarIdl from "@/idl/tip_jar.json";
import subscriptionIdl from "@/idl/subscription.json";
import eventsIdl from "@/idl/events.json";
import registryIdl from "@/idl/rwa_registry.json";
import mintIdl from "@/idl/rwa_mint.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import eventTicketsIdl from "@/idl/event_tickets.json";

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

type Snapshot = {
  // Marketplace
  activeListings: number;
  totalListedUsdc: number;
  floorPriceUsdc: number | null;
  topAssets: Array<{
    mint: string;
    name: string;
    symbol: string;
    soldCount: number;
    totalRevenueUsdc: number;
  }>;

  // RWA
  totalIssuers: number;
  activeIssuers: number;
  totalAssets: number;
  assetsByCategory: Record<string, number>;

  // OTC
  totalOtcDeals: number;
  acceptedOtcDeals: number;

  // Creator
  totalCreators: number;
  totalSubscriptionPlans: number;
  totalEvents: number;

  // Recent activity per program (last N txs)
  recentActivity: Array<{
    program: string;
    signature: string;
    slot: number;
    blockTime: number | null;
    err: boolean;
  }>;
};

const PROGRAMS_FOR_ACTIVITY: Array<{ key: string; label: string; id: string }> = [
  { key: "marketplace", label: "marketplace", id: (marketplaceIdl as { address: string }).address },
  { key: "otc_deals", label: "otc_deals", id: (otcIdl as { address: string }).address },
  { key: "rwa_mint", label: "rwa_mint", id: (mintIdl as { address: string }).address },
  { key: "rwa_registry", label: "rwa_registry", id: (registryIdl as { address: string }).address },
  { key: "tip_jar", label: "tip_jar", id: (tipJarIdl as { address: string }).address },
  { key: "subscription", label: "subscription", id: (subscriptionIdl as { address: string }).address },
  { key: "events", label: "events", id: (eventsIdl as { address: string }).address },
  { key: "event_tickets", label: "event_tickets", id: (eventTicketsIdl as { address: string }).address },
];

function programInstance(idl: unknown, provider: AnchorProvider): Program {
  return new Program(idl as Idl, provider);
}

async function fetchSnapshot(connection: Connection): Promise<Snapshot> {
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });

  const marketplace = programInstance(marketplaceIdl, provider);
  const otc = programInstance(otcIdl, provider);
  const registry = programInstance(registryIdl, provider);
  const rwaMint = programInstance(mintIdl, provider);
  const tipJar = programInstance(tipJarIdl, provider);
  const subscription = programInstance(subscriptionIdl, provider);
  const events = programInstance(eventsIdl, provider);

  // Trailing comma disambiguates generic from JSX in .tsx files.
  const asRec = <T,>(program: Program, account: string) =>
    (program.account as Record<string, { all: () => Promise<T[]> }>)[account];

  const [
    listingsRaw,
    dealsRaw,
    issuersRaw,
    assetsRaw,
    creatorsRaw,
    plansRaw,
    eventsRaw,
  ] = await Promise.all([
    asRec<{ publicKey: PublicKey; account: { assetMint: PublicKey; pricePerToken: BN; initialQuantity: BN; remainingQuantity: BN; status: Record<string, unknown> } }>(marketplace, "listing")?.all() ?? [],
    asRec<{ publicKey: PublicKey; account: { status: Record<string, unknown> } }>(otc, "deal")?.all() ?? [],
    asRec<{ publicKey: PublicKey; account: { status: Record<string, unknown> } }>(registry, "issuer")?.all() ?? [],
    asRec<{ publicKey: PublicKey; account: { mint: PublicKey; name: string; symbol: string; category: Record<string, unknown> } }>(rwaMint, "asset")?.all() ?? [],
    asRec<unknown>(tipJar, "creatorProfile")?.all() ?? [],
    asRec<unknown>(subscription, "plan")?.all() ?? [],
    asRec<unknown>(events, "event")?.all() ?? [],
  ]);

  const activeListings = (listingsRaw as Array<{ account: { status: Record<string, unknown> } }>).filter((l) => "active" in l.account.status);
  const totalListedUsdc = activeListings.reduce(
    (s, l) => {
      const acc = (l as unknown as { account: { pricePerToken: BN; initialQuantity: BN } }).account;
      return s + (Number(acc.pricePerToken.toString()) / USDC_UNIT) * acc.initialQuantity.toNumber();
    },
    0
  );
  const floorPriceUsdc = activeListings.length > 0
    ? Math.min(
        ...activeListings.map((l) => Number((l as unknown as { account: { pricePerToken: BN } }).account.pricePerToken.toString()) / USDC_UNIT)
      )
    : null;

  // Top assets by sold_count (quantity already moved: initial - remaining)
  const listingsByMint = new Map<string, { sold: number; revenue: number }>();
  for (const l of listingsRaw as Array<{ account: { assetMint: PublicKey; pricePerToken: BN; initialQuantity: BN; remainingQuantity: BN } }>) {
    const mintKey = l.account.assetMint.toBase58();
    const sold = l.account.initialQuantity.toNumber() - l.account.remainingQuantity.toNumber();
    const priceUsdc = Number(l.account.pricePerToken.toString()) / USDC_UNIT;
    const rev = sold * priceUsdc;
    const prev = listingsByMint.get(mintKey) ?? { sold: 0, revenue: 0 };
    listingsByMint.set(mintKey, { sold: prev.sold + sold, revenue: prev.revenue + rev });
  }
  const assetByMint = new Map<string, { name: string; symbol: string; category: string }>();
  for (const a of assetsRaw as Array<{ account: { mint: PublicKey; name: string; symbol: string; category: Record<string, unknown> } }>) {
    assetByMint.set(a.account.mint.toBase58(), {
      name: a.account.name,
      symbol: a.account.symbol,
      category: Object.keys(a.account.category)[0] ?? "other",
    });
  }
  const topAssets = Array.from(listingsByMint.entries())
    .map(([mint, v]) => {
      const meta = assetByMint.get(mint);
      return {
        mint,
        name: meta?.name ?? "(unknown)",
        symbol: meta?.symbol ?? "—",
        soldCount: v.sold,
        totalRevenueUsdc: v.revenue,
      };
    })
    .filter((a) => a.soldCount > 0)
    .sort((a, b) => b.totalRevenueUsdc - a.totalRevenueUsdc)
    .slice(0, 5);

  const assetsByCategory: Record<string, number> = {};
  for (const a of assetsRaw as Array<{ account: { category: Record<string, unknown> } }>) {
    const cat = Object.keys(a.account.category)[0] ?? "other";
    assetsByCategory[cat] = (assetsByCategory[cat] ?? 0) + 1;
  }

  // Recent activity per program — last 3 signatures, keep only the first ~40 overall.
  const recentActivity: Snapshot["recentActivity"] = [];
  const sigResults = await Promise.all(
    PROGRAMS_FOR_ACTIVITY.map(async (p) => {
      try {
        const sigs = await connection.getSignaturesForAddress(new PublicKey(p.id), { limit: 3 });
        return { label: p.label, sigs };
      } catch {
        return { label: p.label, sigs: [] as ConfirmedSignatureInfo[] };
      }
    })
  );
  for (const { label, sigs } of sigResults) {
    for (const s of sigs) {
      recentActivity.push({
        program: label,
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? null,
        err: s.err !== null,
      });
    }
  }
  recentActivity.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

  return {
    activeListings: activeListings.length,
    totalListedUsdc,
    floorPriceUsdc,
    topAssets,
    totalIssuers: issuersRaw.length,
    activeIssuers: (issuersRaw as Array<{ account: { status: Record<string, unknown> } }>).filter((i) => "active" in i.account.status).length,
    totalAssets: assetsRaw.length,
    assetsByCategory,
    totalOtcDeals: dealsRaw.length,
    acceptedOtcDeals: (dealsRaw as Array<{ account: { status: Record<string, unknown> } }>).filter((d) => "accepted" in d.account.status).length,
    totalCreators: creatorsRaw.length,
    totalSubscriptionPlans: plansRaw.length,
    totalEvents: eventsRaw.length,
    recentActivity: recentActivity.slice(0, 25),
  };
}

export function StatsView() {
  const { connection } = useConnection();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSnapshot(connection);
      setSnapshot(s);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <section style={{ marginBottom: "2.5rem" }}>
        <Eyebrow>Live · devnet</Eyebrow>
        <h1 style={h1Style}>
          Every number below is queried from Solana RPC on page load.
        </h1>
        <p style={leadStyle}>
          No backend cache, no CMS — pure <code style={inlineCode}>getProgramAccounts</code> + <code style={inlineCode}>getSignaturesForAddress</code> against the eight Anchor programs.
        </p>
        <button
          onClick={() => void reload()}
          disabled={loading}
          style={{
            marginTop: "1.25rem",
            background: "transparent",
            border: "1px solid #333",
            color: "#e8e8e8",
            padding: "0.5rem 1.15rem",
            borderRadius: 7,
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        {error ? (
          <div style={{ marginTop: "1rem", color: "#f87171", fontSize: "0.85rem" }}>
            {error}
          </div>
        ) : null}
      </section>

      {snapshot ? (
        <>
          <Section label="Marketplace">
            <div style={statGrid(4)}>
              <Stat value={snapshot.activeListings.toString()} label="Active listings" />
              <Stat value={`$${snapshot.totalListedUsdc.toFixed(2)}`} label="Gross listed value" />
              <Stat value={snapshot.floorPriceUsdc !== null ? `$${snapshot.floorPriceUsdc.toFixed(2)}` : "—"} label="Floor price" />
              <Stat value={snapshot.topAssets.reduce((s, a) => s + a.soldCount, 0).toString()} label="Tokens sold to date" />
            </div>

            {snapshot.topAssets.length > 0 ? (
              <div style={{ marginTop: "1.25rem" }}>
                <SubLabel>Top assets by sales volume</SubLabel>
                <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden", marginTop: "0.5rem" }}>
                  {snapshot.topAssets.map((a) => (
                    <div
                      key={a.mint}
                      style={{
                        padding: "0.8rem 1.1rem",
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr",
                        gap: "0.75rem",
                        alignItems: "center",
                        borderBottom: "1px solid #1a1a1a",
                        fontSize: "0.9rem",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#6a6a6a", fontFamily: "'SF Mono', Menlo, monospace" }}>
                          {a.symbol} · {shorten(a.mint)}
                        </div>
                      </div>
                      <div style={{ color: "#a5b4fc", fontWeight: 600 }}>{a.soldCount} sold</div>
                      <div style={{ color: "#10b981", fontWeight: 600, textAlign: "right" }}>
                        ${a.totalRevenueUsdc.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          <Section label="RWA stack">
            <div style={statGrid(4)}>
              <Stat value={snapshot.totalIssuers.toString()} label="Registered issuers" />
              <Stat value={snapshot.activeIssuers.toString()} label="Active issuers" />
              <Stat value={snapshot.totalAssets.toString()} label="Tokenised assets" />
              <Stat value={Object.keys(snapshot.assetsByCategory).length.toString()} label="Categories in use" />
            </div>
            {Object.keys(snapshot.assetsByCategory).length > 0 ? (
              <div style={{ marginTop: "1.25rem" }}>
                <SubLabel>Asset mix</SubLabel>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {Object.entries(snapshot.assetsByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => (
                      <span
                        key={category}
                        style={{
                          background: "#0f0f0f",
                          border: "1px solid #1a1a1a",
                          padding: "0.4rem 0.85rem",
                          borderRadius: 999,
                          fontSize: "0.85rem",
                        }}
                      >
                        <strong style={{ color: "#fff" }}>{count}</strong>{" "}
                        <span style={{ color: "#9a9a9a" }}>{category}</span>
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </Section>

          <Section label="OTC + creator rails">
            <div style={statGrid(5)}>
              <Stat value={snapshot.totalOtcDeals.toString()} label="OTC deals total" />
              <Stat value={snapshot.acceptedOtcDeals.toString()} label="OTC deals accepted" />
              <Stat value={snapshot.totalCreators.toString()} label="Creator profiles" />
              <Stat value={snapshot.totalSubscriptionPlans.toString()} label="Subscription plans" />
              <Stat value={snapshot.totalEvents.toString()} label="Legacy events" />
            </div>
          </Section>

          <Section label="Recent on-chain activity">
            {snapshot.recentActivity.length === 0 ? (
              <div style={{ color: "#9a9a9a", fontSize: "0.9rem" }}>No recent txs.</div>
            ) : (
              <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
                {snapshot.recentActivity.map((a) => (
                  <a
                    key={a.signature}
                    href={`https://explorer.solana.com/tx/${a.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "0.65rem 1.1rem",
                      display: "grid",
                      gridTemplateColumns: "1fr auto 100px auto",
                      gap: "0.75rem",
                      alignItems: "center",
                      borderBottom: "1px solid #1a1a1a",
                      fontSize: "0.85rem",
                      textDecoration: "none",
                      color: "#e8e8e8",
                    }}
                  >
                    <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "#a5b4fc" }}>{a.program}</code>
                    <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "#8a8a8a", fontSize: "0.78rem" }}>
                      {a.signature.slice(0, 8)}…{a.signature.slice(-6)}
                    </code>
                    <span style={{ color: "#6a6a6a", fontSize: "0.78rem", textAlign: "right" }}>
                      {a.blockTime ? timeAgo(a.blockTime) : `slot ${a.slot}`}
                    </span>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.15rem 0.45rem",
                        borderRadius: 4,
                        fontWeight: 600,
                        background: a.err ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                        color: a.err ? "#f87171" : "#34d399",
                      }}
                    >
                      {a.err ? "FAILED" : "OK"}
                    </span>
                  </a>
                ))}
              </div>
            )}
            <div style={{ fontSize: "0.78rem", color: "#6a6a6a", marginTop: "0.75rem" }}>
              Top 3 signatures from each program, sorted newest first. Click any row to open Solana Explorer.
            </div>
          </Section>
        </>
      ) : loading ? (
        <div style={{ color: "#9a9a9a", fontSize: "0.95rem", padding: "2rem 0" }}>
          Querying Solana RPC…
        </div>
      ) : null}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "3rem" }}>
      <h2
        style={{
          fontSize: "0.85rem",
          color: "#9a9a9a",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "0.75rem",
        }}
      >
        {label}
      </h2>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        padding: "1.15rem 1.25rem",
      }}
    >
      <div style={{ fontSize: "1.65rem", fontWeight: 600, letterSpacing: 0 }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "#8a8a8a", marginTop: "0.35rem" }}>{label}</div>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.72rem",
        color: "#6a6a6a",
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        background: "rgba(16,185,129,0.12)",
        color: "#6ee7b7",
        padding: "0.3rem 0.75rem",
        borderRadius: 999,
        fontSize: "0.74rem",
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        marginBottom: "1rem",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
      {children}
    </div>
  );
}

function statGrid(cols: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: "0.9rem",
  };
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function timeAgo(blockTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - blockTime);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

const h1Style: React.CSSProperties = {
  fontSize: "2rem",
  lineHeight: 1.1,
  letterSpacing: 0,
  fontWeight: 600,
  marginBottom: "1rem",
};

const leadStyle: React.CSSProperties = {
  fontSize: "1rem",
  color: "#b5b5b5",
  lineHeight: 1.65,
  maxWidth: 720,
};

const inlineCode: React.CSSProperties = {
  background: "#1a1a1a",
  color: "#a5b4fc",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.82em",
  fontFamily: "'SF Mono', Menlo, monospace",
};
