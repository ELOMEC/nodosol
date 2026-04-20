"use client";

import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  assetClassLabels,
  decodeIssuerStatus,
  jurisdictionsToString,
  IssuerStatusKey,
} from "@/lib/rwa";
import { fetchImagesForUris, toHttp } from "@/lib/metadataImages";

import registryIdl from "@/idl/rwa_registry.json";
import mintIdl from "@/idl/rwa_mint.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import eventTicketsIdl from "@/idl/event_tickets.json";

class ReadOnlyWallet {
  readonly payer = Keypair.generate();
  readonly publicKey = this.payer.publicKey;
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T) { return tx; }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]) { return txs; }
}

type AssetHit = {
  kind: "asset";
  mint: string;
  name: string;
  symbol: string;
  category: string;
  imageUrl: string | null;
  issuerOwner: string;
};

type EventHit = {
  kind: "event";
  address: string;
  eventId: string;
  name: string;
  symbol: string;
  priceUsdc: number;
  capacity: number;
  sold: number;
  creator: string;
};

type ListingHit = {
  kind: "listing";
  address: string;
  seller: string;
  assetMint: string;
  priceUsdc: number;
  remainingQuantity: number;
};

type DealHit = {
  kind: "deal";
  address: string;
  seller: string;
  buyer: string;
  dealId: string;
  totalPriceUsdc: number;
  quantity: number;
  status: string;
};

type IssuerHit = {
  kind: "issuer";
  address: string;
  owner: string;
  status: IssuerStatusKey;
  jurisdictions: string[];
  assetClasses: string[];
  kycRef: string;
};

type Results = {
  assets: AssetHit[];
  events: EventHit[];
  listings: ListingHit[];
  deals: DealHit[];
  issuers: IssuerHit[];
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; results: Results; total: number }
  | { kind: "error"; message: string };

function loadProgram(idl: unknown, provider: AnchorProvider): Program {
  return new Program(idl as Idl, provider);
}

function tryPubkey(s: string): PublicKey | null {
  try {
    return s.length >= 32 ? new PublicKey(s) : null;
  } catch {
    return null;
  }
}

async function runSearch(
  connection: ReturnType<typeof useConnection>["connection"],
  query: string
): Promise<Results> {
  const normalized = query.trim().toLowerCase();
  const pk = tryPubkey(query.trim());
  const pkStr = pk?.toBase58() ?? null;
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });
  const registry = loadProgram(registryIdl, provider);
  const rwaMint = loadProgram(mintIdl, provider);
  const marketplace = loadProgram(marketplaceIdl, provider);
  const otc = loadProgram(otcIdl, provider);
  const eventTickets = loadProgram(eventTicketsIdl, provider);

  const fetchAll = async <T,>(program: Program, account: string): Promise<T[]> => {
    try {
      const api = (program.account as Record<string, { all: () => Promise<T[]> }>)[account];
      if (!api) return [];
      return await api.all();
    } catch {
      return [];
    }
  };

  const [assetsRaw, eventsRaw, listingsRaw, dealsRaw, issuersRaw] = await Promise.all([
    fetchAll<{
      publicKey: PublicKey;
      account: {
        mint: PublicKey;
        issuerOwner: PublicKey;
        name: string;
        symbol: string;
        category: Record<string, unknown>;
        metadataUri: string;
      };
    }>(rwaMint, "asset"),
    fetchAll<{
      publicKey: PublicKey;
      account: {
        creator: PublicKey;
        eventId: BN;
        name: string;
        symbol: string;
        price: BN;
        capacity: BN;
        sold: BN;
      };
    }>(eventTickets, "event"),
    fetchAll<{
      publicKey: PublicKey;
      account: {
        seller: PublicKey;
        assetMint: PublicKey;
        pricePerToken: BN;
        remainingQuantity: BN;
        status: Record<string, unknown>;
      };
    }>(marketplace, "listing"),
    fetchAll<{
      publicKey: PublicKey;
      account: {
        seller: PublicKey;
        buyer: PublicKey;
        dealId: BN;
        quantity: BN;
        totalPrice: BN;
        status: Record<string, unknown>;
      };
    }>(otc, "deal"),
    fetchAll<{
      publicKey: PublicKey;
      account: {
        owner: PublicKey;
        status: Record<string, unknown>;
        jurisdictions: number[][];
        assetClasses: number;
        kycRef: string;
      };
    }>(registry, "issuer"),
  ]);

  const matchesText = (...fields: Array<string | null | undefined>) => {
    if (!normalized) return true;
    for (const f of fields) {
      if (f && f.toLowerCase().includes(normalized)) return true;
    }
    return false;
  };
  const matchesPk = (...fields: Array<string | null | undefined>) => {
    if (!pkStr) return false;
    return fields.some((f) => f === pkStr);
  };

  const filteredAssets = assetsRaw.filter((a) => {
    const name = a.account.name;
    const symbol = a.account.symbol;
    const mint = a.account.mint.toBase58();
    const owner = a.account.issuerOwner.toBase58();
    return matchesText(name, symbol, mint, owner) || matchesPk(mint, owner);
  });
  const uriSet = filteredAssets
    .map((a) => a.account.metadataUri)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const imageByUri = await fetchImagesForUris(uriSet);

  const assets: AssetHit[] = filteredAssets.map((a) => ({
    kind: "asset",
    mint: a.account.mint.toBase58(),
    name: a.account.name,
    symbol: a.account.symbol,
    category: Object.keys(a.account.category)[0] ?? "other",
    imageUrl: a.account.metadataUri ? imageByUri.get(a.account.metadataUri) ?? null : null,
    issuerOwner: a.account.issuerOwner.toBase58(),
  }));

  const events: EventHit[] = eventsRaw
    .filter((e) =>
      matchesText(e.account.name, e.account.symbol, e.account.creator.toBase58()) ||
      matchesPk(e.account.creator.toBase58())
    )
    .map((e) => ({
      kind: "event",
      address: e.publicKey.toBase58(),
      eventId: e.account.eventId.toString(),
      name: e.account.name,
      symbol: e.account.symbol,
      priceUsdc: Number(e.account.price.toString()) / USDC_UNIT,
      capacity: e.account.capacity.toNumber(),
      sold: e.account.sold.toNumber(),
      creator: e.account.creator.toBase58(),
    }));

  const listings: ListingHit[] = listingsRaw
    .filter((l) =>
      matchesText(l.account.seller.toBase58(), l.account.assetMint.toBase58()) ||
      matchesPk(l.account.seller.toBase58(), l.account.assetMint.toBase58())
    )
    .map((l) => ({
      kind: "listing",
      address: l.publicKey.toBase58(),
      seller: l.account.seller.toBase58(),
      assetMint: l.account.assetMint.toBase58(),
      priceUsdc: Number(l.account.pricePerToken.toString()) / USDC_UNIT,
      remainingQuantity: l.account.remainingQuantity.toNumber(),
    }));

  const deals: DealHit[] = dealsRaw
    .filter((d) =>
      matchesText(d.account.seller.toBase58(), d.account.buyer.toBase58()) ||
      matchesPk(d.account.seller.toBase58(), d.account.buyer.toBase58())
    )
    .map((d) => ({
      kind: "deal",
      address: d.publicKey.toBase58(),
      seller: d.account.seller.toBase58(),
      buyer: d.account.buyer.toBase58(),
      dealId: d.account.dealId.toString(),
      totalPriceUsdc: Number(d.account.totalPrice.toString()) / USDC_UNIT,
      quantity: d.account.quantity.toNumber(),
      status: Object.keys(d.account.status)[0] ?? "proposed",
    }));

  const issuers: IssuerHit[] = issuersRaw
    .filter((i) =>
      matchesText(i.account.owner.toBase58(), i.account.kycRef) ||
      matchesPk(i.account.owner.toBase58())
    )
    .map((i) => ({
      kind: "issuer",
      address: i.publicKey.toBase58(),
      owner: i.account.owner.toBase58(),
      status: decodeIssuerStatus(i.account.status),
      jurisdictions: jurisdictionsToString(i.account.jurisdictions),
      assetClasses: assetClassLabels(i.account.assetClasses),
      kycRef: i.account.kycRef,
    }));

  return { assets, events, listings, deals, issuers };
}

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const { connection } = useConnection();
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const run = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setState({ kind: "idle" });
        return;
      }
      setState({ kind: "loading" });
      try {
        const results = await runSearch(connection, q);
        const total =
          results.assets.length +
          results.events.length +
          results.listings.length +
          results.deals.length +
          results.issuers.length;
        setState({ kind: "ready", results, total });
      } catch (err) {
        console.error(err);
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Search failed",
        });
      }
    },
    [connection]
  );

  useEffect(() => {
    if (initialQuery) {
      void run(initialQuery);
    }
  }, [initialQuery, run]);

  return (
    <>
      <header style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Global search
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Search across RWA assets, cNFT events, marketplace listings, OTC deals, and issuer registry. Pubkeys match exactly; names / symbols / KYC refs match case-insensitively.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const url = new URL(window.location.href);
          url.searchParams.set("q", query);
          window.history.replaceState(null, "", url.toString());
          void run(query);
        }}
        style={{
          display: "flex",
          gap: "0.6rem",
          marginBottom: "1.5rem",
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Asset name, symbol, wallet address, or KYC ref"
          style={{
            flex: 1,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            color: "#111827",
            padding: "0.7rem 1rem",
            fontSize: "0.95rem",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          style={{
            background: "#4f46e5",
            color: "#fff",
            border: "none",
            padding: "0.7rem 1.35rem",
            borderRadius: 10,
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      {state.kind === "idle" ? (
        <CenteredCard>
          Enter a query above to search across every on-chain account Nodosol owns.
        </CenteredCard>
      ) : state.kind === "loading" ? (
        <CenteredCard>Querying Solana…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : state.total === 0 ? (
        <CenteredCard>
          <strong style={{ color: "#111827", display: "block", marginBottom: "0.35rem" }}>
            Nothing matched
          </strong>
          Try a different name, symbol, or wallet address.
        </CenteredCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <ResultGroup title="Assets" count={state.results.assets.length}>
            {state.results.assets.map((a) => (
              <AssetResultCard key={a.mint} hit={a} />
            ))}
          </ResultGroup>
          <ResultGroup title="Events" count={state.results.events.length}>
            {state.results.events.map((e) => (
              <EventResultCard key={e.address} hit={e} />
            ))}
          </ResultGroup>
          <ResultGroup title="Listings" count={state.results.listings.length}>
            {state.results.listings.map((l) => (
              <ListingResultCard key={l.address} hit={l} />
            ))}
          </ResultGroup>
          <ResultGroup title="OTC deals" count={state.results.deals.length}>
            {state.results.deals.map((d) => (
              <DealResultCard key={d.address} hit={d} />
            ))}
          </ResultGroup>
          <ResultGroup title="Issuers" count={state.results.issuers.length}>
            {state.results.issuers.map((i) => (
              <IssuerResultCard key={i.address} hit={i} />
            ))}
          </ResultGroup>
        </div>
      )}
    </>
  );
}

function ResultGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2
        style={{
          fontSize: "0.82rem",
          color: "#6b7280",
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "0.75rem",
        }}
      >
        {title} · {count}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>{children}</div>
    </section>
  );
}

function AssetResultCard({ hit }: { hit: AssetHit }) {
  return (
    <Link href={`/marketplace/assets/${hit.mint}`} style={linkRowStyle}>
      {hit.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={toHttp(hit.imageUrl)} alt={hit.name} style={thumbStyle} />
      ) : (
        <div style={{ ...thumbStyle, background: "#eef2ff" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#111827" }}>
          {hit.name || "(unnamed)"} <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: "0.85rem" }}>· {hit.symbol}</span>
        </div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280", fontFamily: "'SF Mono', Menlo, monospace" }}>
          {hit.category} · mint {shorten(hit.mint)} · issuer {shorten(hit.issuerOwner)}
        </div>
      </div>
      <span style={pillStyle("#eef2ff", "#4338ca")}>Asset</span>
    </Link>
  );
}

function EventResultCard({ hit }: { hit: EventHit }) {
  const left = hit.capacity - hit.sold;
  return (
    <Link href="/marketplace/events" style={linkRowStyle}>
      <div style={{ ...thumbStyle, background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{hit.name || "(unnamed)"}</div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          {hit.symbol} · ${hit.priceUsdc.toFixed(2)} · {left} of {hit.capacity} left · by {shorten(hit.creator)}
        </div>
      </div>
      <span style={pillStyle("rgba(139,92,246,0.12)", "#6d28d9")}>Event</span>
    </Link>
  );
}

function ListingResultCard({ hit }: { hit: ListingHit }) {
  return (
    <Link href={`/marketplace/assets/${hit.assetMint}`} style={linkRowStyle}>
      <div style={{ ...thumbStyle, background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          ${hit.priceUsdc.toFixed(2)} <span style={{ color: "#9ca3af", fontWeight: 500 }}>per token</span>
        </div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          {hit.remainingQuantity} remaining · by {shorten(hit.seller)} · mint {shorten(hit.assetMint)}
        </div>
      </div>
      <span style={pillStyle("rgba(16,185,129,0.12)", "#059669")}>Listing</span>
    </Link>
  );
}

function DealResultCard({ hit }: { hit: DealHit }) {
  return (
    <Link href="/marketplace/otc" style={linkRowStyle}>
      <div style={{ ...thumbStyle, background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          OTC #{hit.dealId} · ${hit.totalPriceUsdc.toFixed(2)} for {hit.quantity}
        </div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          seller {shorten(hit.seller)} → buyer {shorten(hit.buyer)} · {hit.status}
        </div>
      </div>
      <span style={pillStyle("rgba(59,130,246,0.12)", "#2563eb")}>OTC</span>
    </Link>
  );
}

function IssuerResultCard({ hit }: { hit: IssuerHit }) {
  return (
    <Link href="/admin/issuers" style={linkRowStyle}>
      <div style={{ ...thumbStyle, background: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontFamily: "'SF Mono', Menlo, monospace" }}>{shorten(hit.owner)}</div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          {hit.status} · {hit.jurisdictions.join(", ") || "—"} · {hit.assetClasses.join(" · ") || "no classes"} · KYC {hit.kycRef}
        </div>
      </div>
      <span style={pillStyle("rgba(79,70,229,0.12)", "#4338ca")}>Issuer</span>
    </Link>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "2.5rem 1.5rem",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function pillStyle(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: "0.2rem 0.6rem",
    borderRadius: 4,
    fontSize: "0.72rem",
    fontWeight: 600,
  };
}

const linkRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  background: "#ffffff",
  border: "1px solid #eef0f3",
  borderRadius: 10,
  padding: "0.75rem 1rem",
  textDecoration: "none",
  color: "#111827",
};

const thumbStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  objectFit: "cover",
  flexShrink: 0,
};
