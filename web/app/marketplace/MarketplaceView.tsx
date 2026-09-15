"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  decodeListingStatus,
  fetchMarketplaceConfig,
  listingPda,
  listingVaultPda,
  marketplaceProgram,
} from "@/lib/marketplace";
import { jurisdictionsToString, mintProgram, registryProgram } from "@/lib/rwa";
import { simulateAndSend } from "@/lib/tx";
import { explainSolanaError } from "@/lib/solanaErrors";
import { useToast } from "@/components/ToastProvider";

type Listing = {
  address: string;
  seller: string;
  assetMint: string;
  paymentMint: string;
  pricePerTokenBaseUnits: bigint;
  priceUsdc: number;
  initialQuantity: number;
  remainingQuantity: number;
  status: "active" | "cancelled" | "soldOut";
  createdAt: number;
  // Denormalized asset metadata (if we can find the matching Asset PDA).
  assetName: string | null;
  assetSymbol: string | null;
  assetCategory: string | null;
  assetDelivery: boolean | null;
  assetMetadataUri: string | null;
  assetImage: string | null; // resolved from metadata JSON
  assetGallery: string[];
  // Jurisdictions authorised on the asset's issuer (e.g. ["SRB", "MNE"]).
  // Empty if the issuer PDA wasn't found (shouldn't happen for live assets).
  assetJurisdictions: string[];
};

type MarketplaceListingsData = {
  listings: Listing[];
  feeBps: number;
};

type ViewMode = "gallery" | "compact" | "table";

const CATEGORY_LABEL: Record<string, string> = {
  commodity: "Commodities",
  realEstate: "Real Estate",
  debt: "Debt",
  equity: "Equity",
  ticket: "Tickets",
  carbon: "Carbon",
  other: "Other",
};

const CATEGORY_GRADIENT: Record<string, string> = {
  commodity: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  realEstate: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
  debt: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
  equity: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
  ticket: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  carbon: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
  other: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
};

async function fetchMarketplaceListings(
  connection: Connection,
  wallet: WalletContextState
): Promise<MarketplaceListingsData> {
  const provider = new AnchorProvider(
    connection,
    (wallet.publicKey ? wallet : { publicKey: PublicKey.default }) as unknown as Wallet,
    { commitment: "confirmed" }
  );
  const market = marketplaceProgram(provider);
  const rwa = mintProgram(provider);
  const registry = registryProgram(provider);

  let feeBps = 250;
  try {
    const cfg = await fetchMarketplaceConfig(market);
    feeBps = cfg.feeBps;
  } catch {
    // ignore — keep default
  }

  const listingsRaw = (await (market.account as Record<string, {
    all: () => Promise<Array<{
      publicKey: PublicKey;
      account: {
        seller: PublicKey;
        assetMint: PublicKey;
        paymentMint: PublicKey;
        pricePerToken: BN;
        initialQuantity: BN;
        remainingQuantity: BN;
        status: Record<string, unknown>;
        createdAt: BN;
      };
    }>>;
  }>).listing.all());

  const mintSet = new Set(listingsRaw.map((x) => x.account.assetMint.toBase58()));
  const allAssets = (await (rwa.account as Record<string, {
    all: () => Promise<Array<{
      publicKey: PublicKey;
      account: {
        issuerOwner: PublicKey;
        mint: PublicKey;
        category: Record<string, unknown>;
        name: string;
        symbol: string;
        deliveryRequired: boolean;
        metadataUri: string;
      };
    }>>;
  }>).asset.all());
  const assetByMint = new Map<string, (typeof allAssets)[number]["account"]>();
  for (const a of allAssets) {
    if (mintSet.has(a.account.mint.toBase58())) {
      assetByMint.set(a.account.mint.toBase58(), a.account);
    }
  }

  const issuerByOwner = new Map<string, string[]>();
  try {
    const allIssuers = await (registry.account as Record<string, {
      all: () => Promise<Array<{
        publicKey: PublicKey;
        account: {
          owner: PublicKey;
          jurisdictions: number[][];
        };
      }>>;
    }>).issuer.all();
    for (const i of allIssuers) {
      issuerByOwner.set(
        i.account.owner.toBase58(),
        jurisdictionsToString(i.account.jurisdictions),
      );
    }
  } catch (err) {
    console.warn("issuer lookup failed; jurisdictions will be empty", err);
  }

  const uniqueUris = Array.from(
    new Set(
      Array.from(assetByMint.values())
        .map((a) => a.metadataUri)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
    )
  );
  const imageByUri = new Map<string, string>();
  const galleryByUri = new Map<string, string[]>();
  await Promise.all(
    uniqueUris.map(async (uri) => {
      try {
        const httpUri = uri.startsWith("ipfs://")
          ? uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
          : uri;
        const resp = await fetch(httpUri, { cache: "force-cache" });
        if (!resp.ok) return;
        const json = (await resp.json()) as {
          image?: string;
          gallery?: string[];
          properties?: {
            files?: Array<{ uri?: string; type?: string }>;
          };
        };
        if (json.image) imageByUri.set(uri, json.image);
        galleryByUri.set(uri, galleryImagesFromMetadata(json));
      } catch {
        // ignore
      }
    })
  );

  const listings: Listing[] = listingsRaw
    .filter((x) => decodeListingStatus(x.account.status) === "active")
    .map(({ publicKey: addr, account }) => {
      const assetMint = account.assetMint.toBase58();
      const meta = assetByMint.get(assetMint);
      const priceBase = BigInt(account.pricePerToken.toString());
      const metadataUri = meta?.metadataUri ?? null;
      return {
        address: addr.toBase58(),
        seller: account.seller.toBase58(),
        assetMint,
        paymentMint: account.paymentMint.toBase58(),
        pricePerTokenBaseUnits: priceBase,
        priceUsdc: Number(priceBase) / USDC_UNIT,
        initialQuantity: account.initialQuantity.toNumber(),
        remainingQuantity: account.remainingQuantity.toNumber(),
        status: decodeListingStatus(account.status),
        createdAt: account.createdAt.toNumber(),
        assetName: meta?.name ?? null,
        assetSymbol: meta?.symbol ?? null,
        assetCategory: meta ? decodeCategory(meta.category) : null,
        assetDelivery: meta?.deliveryRequired ?? null,
        assetMetadataUri: metadataUri,
        assetImage: metadataUri ? imageByUri.get(metadataUri) ?? null : null,
        assetGallery: metadataUri ? galleryByUri.get(metadataUri) ?? [] : [],
        assetJurisdictions: meta
          ? issuerByOwner.get(meta.issuerOwner.toBase58()) ?? []
          : [],
      };
    });
  listings.sort((a, b) => b.createdAt - a.createdAt);

  return { listings, feeBps };
}

export function MarketplaceView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const queryClient = useQueryClient();

  const [buyModal, setBuyModal] = useState<{
    listing: Listing;
    qty: string;
    submitting: boolean;
  } | null>(null);
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "physical" | "digital">("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"newest" | "price_asc" | "price_desc" | "supply">("newest");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const toast = useToast();

  const listingsQuery = useQuery({
    queryKey: [
      "marketplace",
      "listings",
      connection.rpcEndpoint,
      publicKey?.toBase58() ?? "anon",
    ],
    queryFn: () => fetchMarketplaceListings(connection, wallet),
  });

  async function submitBuy() {
    if (!buyModal || !publicKey) return;
    const { listing, qty } = buyModal;
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > listing.remainingQuantity) {
      window.alert("Invalid quantity");
      return;
    }
    setBuyModal({ ...buyModal, submitting: true });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);

      const assetMint = new PublicKey(listing.assetMint);
      const paymentMint = new PublicKey(listing.paymentMint);
      const seller = new PublicKey(listing.seller);
      const [listingAddr] = listingPda(seller, assetMint);
      const [vault] = listingVaultPda(listingAddr);
      const buyerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const buyerPaymentAta = getAssociatedTokenAddressSync(
        paymentMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const sellerPaymentAta = getAssociatedTokenAddressSync(
        paymentMint,
        seller,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const cfg = await fetchMarketplaceConfig(program);

      const ix = await program.methods
        .buyListing(new BN(qtyNum))
        .accounts({
          buyer: publicKey,
          assetMint,
          paymentMint,
          listing: listingAddr,
          vault,
          buyerAssetAccount: buyerAssetAta,
          buyerPaymentAccount: buyerPaymentAta,
          sellerPaymentAccount: sellerPaymentAta,
          config: cfg.address,
          treasury: cfg.treasury,
          assetTokenProgram: TOKEN_2022_PROGRAM_ID,
          paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ix,
        ],
      });
      setBuyModal(null);
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "listings"] });
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
      setBuyModal((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  const allListings = listingsQuery.data?.listings ?? [];
  const feeBps = listingsQuery.data?.feeBps ?? 250;
  const totalVolume = allListings.reduce((s, l) => s + l.priceUsdc * l.initialQuantity, 0);
  const availableCategories = Array.from(
    new Set(allListings.map((l) => l.assetCategory ?? "other"))
  );
  const availableJurisdictions = Array.from(
    new Set(allListings.flatMap((l) => l.assetJurisdictions))
  ).sort();

  const searchLower = search.trim().toLowerCase();
  const listings = allListings
    .filter((l) => {
      if (categoryFilter !== "all" && (l.assetCategory ?? "other") !== categoryFilter) return false;
      if (deliveryFilter === "physical" && !l.assetDelivery) return false;
      if (deliveryFilter === "digital" && l.assetDelivery) return false;
      if (
        jurisdictionFilter !== "all" &&
        !l.assetJurisdictions.includes(jurisdictionFilter)
      ) {
        return false;
      }
      if (searchLower) {
        const hay = [l.assetName, l.assetSymbol, l.seller, l.assetMint]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortKey) {
        case "price_asc":
          return a.priceUsdc - b.priceUsdc;
        case "price_desc":
          return b.priceUsdc - a.priceUsdc;
        case "supply":
          return b.remainingQuantity - a.remainingQuantity;
        case "newest":
        default:
          return b.createdAt - a.createdAt;
      }
    });

  return (
    <>
      <section
        style={{
          background:
            "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.94) 48%, rgba(37,99,235,0.88) 100%)",
          border: "1px solid rgba(148,163,184,0.22)",
          borderRadius: 20,
          color: "#fff",
          padding: "2rem",
          marginBottom: "1.25rem",
          boxShadow: "var(--brand-shadow)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.18), transparent 26rem)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: "2rem", alignItems: "end" }} className="nds-market-hero-grid">
          <div>
            <div style={{ color: "#bfdbfe", fontSize: "0.76rem", fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Live regulated market
            </div>
            <h1 style={{ fontSize: "2.7rem", lineHeight: 1.05, letterSpacing: 0, fontWeight: 780, maxWidth: 780, marginBottom: "1rem" }}>
              Browse tokenized real-world assets.
            </h1>
            <p style={{ color: "#cbd5e1", fontSize: "1rem", lineHeight: 1.65, maxWidth: 650, marginBottom: "1.25rem" }}>
              Compare issuer status, delivery terms, available supply and USDC
              settlement before opening a wallet prompt.
            </p>
            <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
              <Link href="/marketplace/tokenize" style={heroPrimaryLink}>
                Issue an asset
              </Link>
              <Link href="/marketplace/portfolio" style={heroSecondaryLink}>
                View portfolio
              </Link>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
            <MarketHeroMetric label="Listings" value={allListings.length.toString()} sub="on-chain active" />
            <MarketHeroMetric
              label="Floor"
              value={allListings.length > 0 ? `$${Math.min(...allListings.map((l) => l.priceUsdc)).toFixed(2)}` : "—"}
              sub="lowest token"
            />
            <MarketHeroMetric label="Listed value" value={`$${compactUsd(totalVolume)}`} sub="current ask" />
            <MarketHeroMetric label="Fee" value={`${(feeBps / 100).toFixed(2)}%`} sub="platform route" />
          </div>
        </div>
      </section>

      <FilterBar
        search={search}
        onSearch={setSearch}
        category={categoryFilter}
        onCategory={setCategoryFilter}
        delivery={deliveryFilter}
        onDelivery={setDeliveryFilter}
        jurisdiction={jurisdictionFilter}
        onJurisdiction={setJurisdictionFilter}
        sortKey={sortKey}
        onSort={setSortKey}
        availableCategories={availableCategories}
        availableJurisdictions={availableJurisdictions}
        filteredCount={listings.length}
        totalCount={allListings.length}
        viewMode={viewMode}
        onViewMode={setViewMode}
      />

      {listingsQuery.isPending ? (
        <CenteredCard>Loading listings from Solana…</CenteredCard>
      ) : listingsQuery.isError ? (
        <CenteredCard>
          Failed to load: {listingsQuery.error instanceof Error ? listingsQuery.error.message : "Fetch failed"}
        </CenteredCard>
      ) : listings.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            No active listings yet
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", marginBottom: "1.2rem" }}>
            Tokenise an asset and list it to get the marketplace started.
          </div>
          <Link
            href="/marketplace/tokenize"
            style={{
              display: "inline-block",
              background: "#4f46e5",
              color: "#fff",
              padding: "0.6rem 1.15rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Tokenize asset
          </Link>
        </CenteredCard>
      ) : viewMode === "table" ? (
        <ListingsTable
          listings={listings}
          connected={connected}
          publicKey={publicKey}
          onBuy={(listing) => setBuyModal({ listing, qty: "1", submitting: false })}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: viewMode === "compact"
              ? "repeat(auto-fill, minmax(260px, 1fr))"
              : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: viewMode === "compact" ? "0.85rem" : "1.15rem",
          }}
        >
          {listings.map((l) => {
            const isOwn = connected && publicKey && publicKey.toBase58() === l.seller;
            return (
              <ListingCard
                key={l.address}
                listing={l}
                isOwn={Boolean(isOwn)}
                onBuy={() => setBuyModal({ listing: l, qty: "1", submitting: false })}
                onPreview={() => setPreviewListing(l)}
                disabled={!connected}
                compact={viewMode === "compact"}
              />
            );
          })}
        </div>
      )}

      {buyModal ? (
        <BuyModal
          listing={buyModal.listing}
          qty={buyModal.qty}
          submitting={buyModal.submitting}
          feeBps={feeBps}
          onChange={(patch) => setBuyModal({ ...buyModal, ...patch })}
          onCancel={() => setBuyModal(null)}
          onSubmit={() => void submitBuy()}
          connected={connected}
        />
      ) : null}

      {previewListing ? (
        <ListingPreviewModal
          listing={previewListing}
          onClose={() => setPreviewListing(null)}
          onBuy={() => {
            setBuyModal({ listing: previewListing, qty: "1", submitting: false });
            setPreviewListing(null);
          }}
          canBuy={connected && publicKey?.toBase58() !== previewListing.seller}
        />
      ) : null}
    </>
  );
}

function toHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");
  }
  return uri;
}

function galleryImagesFromMetadata(json: {
  image?: string;
  gallery?: string[];
  properties?: { files?: Array<{ uri?: string; type?: string }> };
}): string[] {
  const raw = [
    json.image,
    ...(Array.isArray(json.gallery) ? json.gallery : []),
    ...(Array.isArray(json.properties?.files)
      ? json.properties.files
          .filter((file) => file.type?.startsWith("image/") || /\.(png|jpe?g|webp|avif)$/i.test(file.uri ?? ""))
          .map((file) => file.uri)
      : []),
  ].filter((src): src is string => Boolean(src));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of raw) {
    const http = toHttp(src);
    if (seen.has(http)) continue;
    seen.add(http);
    out.push(http);
  }
  return out;
}

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "var(--shell-muted)",
      }}
    >
      {children}
    </div>
  );
}

function MarketHeroMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "1rem", backdropFilter: "blur(12px)" }}>
      <div style={{ fontSize: "0.72rem", color: "#bfdbfe", marginBottom: "0.45rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 780, letterSpacing: 0, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#cbd5e1", marginTop: "0.2rem" }}>{sub}</div>
    </div>
  );
}

function compactUsd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function FilterBar({
  search,
  onSearch,
  category,
  onCategory,
  delivery,
  onDelivery,
  jurisdiction,
  onJurisdiction,
  sortKey,
  onSort,
  availableCategories,
  availableJurisdictions,
  filteredCount,
  totalCount,
  viewMode,
  onViewMode,
}: {
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  delivery: "all" | "physical" | "digital";
  onDelivery: (v: "all" | "physical" | "digital") => void;
  jurisdiction: string;
  onJurisdiction: (v: string) => void;
  sortKey: "newest" | "price_asc" | "price_desc" | "supply";
  onSort: (v: "newest" | "price_asc" | "price_desc" | "supply") => void;
  availableCategories: string[];
  availableJurisdictions: string[];
  filteredCount: number;
  totalCount: number;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}) {
  const categories = [
    { key: "all", label: "All" },
    { key: "commodity", label: "Commodities" },
    { key: "ticket", label: "Tickets" },
    { key: "realEstate", label: "Real Estate" },
    { key: "debt", label: "Debt" },
    { key: "equity", label: "Equity" },
    { key: "carbon", label: "Carbon" },
    { key: "other", label: "Other" },
  ];
  const isActive = (key: string) => category === key;
  const isAvailable = (key: string) => key === "all" || availableCategories.includes(key);
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 16,
        padding: "1rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.9rem",
        boxShadow: "0 10px 34px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {categories.map((cat) => {
          const active = isActive(cat.key);
          const available = isAvailable(cat.key);
          return (
            <button
              key={cat.key}
              onClick={() => onCategory(cat.key)}
              disabled={!available && !active}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: 6,
                border: "none",
                background: active ? "var(--shell-active-bg)" : "transparent",
                color: active ? "var(--shell-link)" : available ? "var(--shell-muted)" : "#d1d5db",
                fontSize: "0.82rem",
                fontWeight: active ? 600 : 500,
                cursor: available || active ? "pointer" : "not-allowed",
              }}
            >
              {cat.label}
            </button>
          );
        })}
        </div>
        <SegmentedView value={viewMode} onChange={onViewMode} />
      </div>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search name, symbol, or seller…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            background: "var(--shell-card)",
            border: "1px solid var(--shell-border-strong)",
            borderRadius: 10,
            color: "var(--shell-fg)",
            padding: "0.68rem 0.85rem",
            fontSize: "0.9rem",
            outline: "none",
          }}
        />
        <select style={filterSelect} value={delivery} onChange={(e) => onDelivery(e.target.value as typeof delivery)}>
          <option value="all">All delivery types</option>
          <option value="physical">Physical delivery</option>
          <option value="digital">Digital only</option>
        </select>
        <select
          style={filterSelect}
          value={jurisdiction}
          onChange={(e) => onJurisdiction(e.target.value)}
          disabled={availableJurisdictions.length === 0}
        >
          <option value="all">
            {availableJurisdictions.length === 0
              ? "No jurisdictions on-chain"
              : "All jurisdictions"}
          </option>
          {availableJurisdictions.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select style={filterSelect} value={sortKey} onChange={(e) => onSort(e.target.value as typeof sortKey)}>
          <option value="newest">Sort: Newest</option>
          <option value="price_asc">Sort: Price ↑</option>
          <option value="price_desc">Sort: Price ↓</option>
          <option value="supply">Sort: Most remaining</option>
        </select>
      </div>
      {filteredCount !== totalCount ? (
        <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)" }}>
          Showing {filteredCount} of {totalCount} listings
        </div>
      ) : null}
    </div>
  );
}

function SegmentedView({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const modes: Array<{ key: ViewMode; label: string }> = [
    { key: "gallery", label: "Gallery" },
    { key: "compact", label: "Compact" },
    { key: "table", label: "Table" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--shell-pill-bg)", border: "1px solid var(--shell-border)", borderRadius: 999 }}>
      {modes.map((mode) => {
        const active = value === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => onChange(mode.key)}
            style={{
              border: "none",
              borderRadius: 999,
              background: active ? "var(--shell-card)" : "transparent",
              color: active ? "var(--shell-fg)" : "var(--shell-muted)",
              padding: "0.42rem 0.75rem",
              fontSize: "0.78rem",
              fontWeight: 750,
              cursor: "pointer",
              boxShadow: active ? "0 4px 12px rgba(15,23,42,0.08)" : "none",
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function ListingsTable({
  listings,
  connected,
  publicKey,
  onBuy,
}: {
  listings: Listing[];
  connected: boolean;
  publicKey: PublicKey | null;
  onBuy: (listing: Listing) => void;
}) {
  return (
    <div
      className="nds-overflow-x"
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 10px 34px rgba(15,23,42,0.04)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr style={{ background: "var(--shell-card-alt)", color: "var(--shell-muted)", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.7 }}>
            <th style={tableHead}>Asset</th>
            <th style={tableHead}>Category</th>
            <th style={tableHead}>Jurisdiction</th>
            <th style={tableHead}>Price</th>
            <th style={tableHead}>Supply</th>
            <th style={tableHead}>Seller</th>
            <th style={{ ...tableHead, textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => {
            const isOwn = connected && publicKey?.toBase58() === listing.seller;
            return (
              <tr key={listing.address} style={{ borderTop: "1px solid var(--shell-border)" }}>
                <td style={tableCell}>
                  <Link href={`/marketplace/assets/${listing.assetMint}`} style={{ color: "var(--shell-fg)", textDecoration: "none", fontWeight: 750 }}>
                    {listing.assetName ?? "(unnamed)"}
                  </Link>
                  <div style={{ color: "var(--shell-muted)", fontSize: "0.76rem", marginTop: 2 }}>
                    {listing.assetSymbol ?? "—"}
                  </div>
                </td>
                <td style={tableCell}>{CATEGORY_LABEL[listing.assetCategory ?? "other"] ?? "RWA"}</td>
                <td style={tableCell}>{listing.assetJurisdictions.slice(0, 3).join(" · ") || "—"}</td>
                <td style={tableCell}>
                  <strong>${listing.priceUsdc.toFixed(2)}</strong>
                  <div style={{ color: "var(--shell-muted)", fontSize: "0.74rem" }}>USDC/token</div>
                </td>
                <td style={tableCell}>{listing.remainingQuantity}/{listing.initialQuantity}</td>
                <td style={tableCell}>{shorten(listing.seller)}</td>
                <td style={{ ...tableCell, textAlign: "right" }}>
                  <button
                    onClick={() => onBuy(listing)}
                    disabled={!connected || isOwn}
                    style={{
                      background: connected && !isOwn ? "#0f172a" : "var(--shell-border-strong)",
                      color: connected && !isOwn ? "#fff" : "var(--shell-faint)",
                      border: "none",
                      borderRadius: 8,
                      padding: "0.48rem 0.75rem",
                      fontSize: "0.78rem",
                      fontWeight: 750,
                      cursor: connected && !isOwn ? "pointer" : "not-allowed",
                    }}
                  >
                    {isOwn ? "Yours" : connected ? "Buy" : "Connect"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableHead: React.CSSProperties = {
  textAlign: "left",
  padding: "0.8rem 1rem",
  fontWeight: 800,
};

const tableCell: React.CSSProperties = {
  padding: "0.9rem 1rem",
  color: "var(--shell-fg)",
  fontSize: "0.86rem",
  verticalAlign: "middle",
};

const filterSelect: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 10,
  color: "var(--shell-fg)",
  padding: "0.68rem 0.75rem",
  fontSize: "0.84rem",
  fontWeight: 650,
  outline: "none",
  cursor: "pointer",
};

const heroPrimaryLink: React.CSSProperties = {
  background: "#fff",
  color: "#0f172a",
  padding: "0.72rem 1rem",
  borderRadius: 10,
  fontSize: "0.88rem",
  fontWeight: 800,
  textDecoration: "none",
};

const heroSecondaryLink: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  padding: "0.72rem 1rem",
  borderRadius: 10,
  fontSize: "0.88rem",
  fontWeight: 800,
  textDecoration: "none",
};

function ListingCard({
  listing,
  isOwn,
  onBuy,
  onPreview,
  disabled,
  compact,
}: {
  listing: Listing;
  isOwn: boolean;
  onBuy: () => void;
  onPreview: () => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const gradient =
    CATEGORY_GRADIENT[listing.assetCategory ?? "other"] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[listing.assetCategory ?? "other"] ?? "RWA";
  const media = listing.assetGallery.length > 0
    ? listing.assetGallery
    : listing.assetImage
      ? [toHttp(listing.assetImage)]
      : [];
  const [activeMedia, setActiveMedia] = useState(0);
  const activeSrc = media[activeMedia] ?? null;
  const remainingPct = listing.initialQuantity > 0
    ? Math.max(0, Math.min(100, (listing.remainingQuantity / listing.initialQuantity) * 100))
    : 0;
  const canBuy = !disabled && !isOwn;

  function shiftMedia(delta: number) {
    if (media.length <= 1) return;
    setActiveMedia((idx) => (idx + delta + media.length) % media.length);
  }

  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 34px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          background: activeSrc ? "#111" : gradient,
          aspectRatio: compact ? "16 / 10" : "4 / 3",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Link
          href={`/marketplace/assets/${listing.assetMint}`}
          aria-label={`Open ${listing.assetName ?? "asset"} details`}
          style={{ position: "absolute", inset: 0, display: "block", textDecoration: "none" }}
        >
          {activeSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeSrc}
              alt={listing.assetName ?? "asset"}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: activeSrc
                ? "linear-gradient(180deg, rgba(2,6,23,0.02) 30%, rgba(2,6,23,0.62) 100%)"
                : "linear-gradient(180deg, rgba(2,6,23,0.08), rgba(2,6,23,0.4))",
            }}
          />
        </Link>

        {media.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => shiftMedia(-1)}
              style={galleryArrowStyle("left")}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => shiftMedia(1)}
              style={galleryArrowStyle("right")}
            >
              ›
            </button>
            <div
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 10,
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(media.length, 5)}, 1fr)`,
                gap: 5,
                zIndex: 2,
              }}
            >
              {media.slice(0, 5).map((src, idx) => (
                <button
                  key={`${src}-${idx}`}
                  type="button"
                  aria-label={`Show image ${idx + 1}`}
                  onClick={() => setActiveMedia(idx)}
                  style={{
                    height: 4,
                    border: "none",
                    borderRadius: 999,
                    background: idx === activeMedia ? "#f8fafc" : "rgba(248,250,252,0.42)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </>
        ) : null}

        {media.length > 0 ? (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(15,23,42,0.72)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "0.22rem 0.48rem",
              borderRadius: 999,
              fontSize: "0.68rem",
              fontWeight: 650,
              zIndex: 2,
            }}
          >
            {activeMedia + 1}/{media.length}
          </div>
        ) : null}

        {media.length > 1 ? (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 22,
              display: "flex",
              gap: 6,
              zIndex: 2,
            }}
          >
            {media.slice(0, 4).map((src, idx) => (
              <button
                key={`thumb-${src}-${idx}`}
                type="button"
                aria-label={`Preview image ${idx + 1}`}
                onClick={() => setActiveMedia(idx)}
                style={{
                  width: 42,
                  height: 32,
                  borderRadius: 5,
                  border: idx === activeMedia ? "2px solid #fff" : "1px solid rgba(255,255,255,0.42)",
                  overflow: "hidden",
                  padding: 0,
                  cursor: "pointer",
                  background: "rgba(15,23,42,0.55)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
            ))}
          </div>
        ) : null}

        {!activeSrc && (
          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: 18,
              color: "#fff",
              fontSize: "2rem",
              fontWeight: 650,
              letterSpacing: 0,
            }}
          >
            {listing.assetSymbol ?? categoryLabel.slice(0, 3).toUpperCase()}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            zIndex: 2,
          }}
        >
          <CardBadge>{categoryLabel}</CardBadge>
          <CardBadge tone="verified">Verified issuer</CardBadge>
        </div>
        {listing.assetDelivery ? (
          <div
            style={{
              position: "absolute",
              top: 46,
              left: 12,
              zIndex: 2,
            }}
          >
            <CardBadge tone="blue">Physical delivery</CardBadge>
          </div>
        ) : null}
      </div>

      <div style={{ padding: compact ? "0.85rem 0.9rem 0.95rem" : "1rem 1.05rem 1.05rem", display: "flex", flexDirection: "column", flex: 1 }}>
        <Link
          href={`/marketplace/assets/${listing.assetMint}`}
          style={{ fontSize: "1rem", fontWeight: 650, marginBottom: "0.15rem", lineHeight: 1.3, color: "var(--shell-fg)", textDecoration: "none" }}
        >
          {listing.assetName ?? "(unnamed asset)"}
        </Link>
        <div style={{ fontSize: "0.76rem", color: "var(--shell-muted)", marginBottom: "0.7rem" }}>
          {listing.assetSymbol ?? "—"} · seller {shorten(listing.seller)}
        </div>

        {listing.assetJurisdictions.length > 0 ? (
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {listing.assetJurisdictions.slice(0, 4).map((j) => (
              <span
                key={j}
                title={`Issuer authorised in ${j}`}
                style={{
                  fontSize: "0.66rem",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  color: "#059669",
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 4,
                }}
              >
                {j}
              </span>
            ))}
            {listing.assetJurisdictions.length > 4 ? (
              <span style={{ fontSize: "0.66rem", color: "var(--shell-muted)", padding: "0.1rem 0.15rem" }}>
                +{listing.assetJurisdictions.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", marginBottom: "0.8rem" }}>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: 0 }}>${listing.priceUsdc.toFixed(2)}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--shell-faint)" }}>per token · USDC</div>
          </div>
          <div style={{ textAlign: "right", minWidth: 96 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", fontWeight: 600 }}>
              {listing.remainingQuantity}/{listing.initialQuantity} left
            </div>
            <div style={{ height: 5, borderRadius: 999, background: "var(--shell-border)", marginTop: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${remainingPct}%`, background: "#2563eb", borderRadius: 999 }} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.55rem", marginTop: "auto" }}>
          <button
            onClick={onBuy}
            disabled={!canBuy}
            style={{
              background: canBuy ? "#0f172a" : "var(--shell-border-strong)",
              color: canBuy ? "#fff" : "var(--shell-faint)",
              border: "none",
              padding: "0.65rem 1rem",
              borderRadius: 8,
              fontSize: "0.86rem",
              fontWeight: 650,
              cursor: canBuy ? "pointer" : "not-allowed",
            }}
          >
            {isOwn ? "Your listing" : disabled ? "Connect wallet" : "Buy now"}
          </button>
          <button
            type="button"
            onClick={onPreview}
            style={{
              border: "1px solid var(--shell-border-strong)",
              color: "var(--shell-fg)",
              background: "var(--shell-card)",
              padding: "0.65rem 0.85rem",
              borderRadius: 8,
              fontSize: "0.86rem",
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            Preview
          </button>
          <Link
            href={`/marketplace/assets/${listing.assetMint}`}
            style={{
              border: "1px solid var(--shell-border-strong)",
              color: "var(--shell-fg)",
              padding: "0.65rem 0.85rem",
              borderRadius: 8,
              fontSize: "0.86rem",
              fontWeight: 650,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Details
          </Link>
        </div>
      </div>
    </div>
  );
}

function ListingPreviewModal({
  listing,
  onClose,
  onBuy,
  canBuy,
}: {
  listing: Listing;
  onClose: () => void;
  onBuy: () => void;
  canBuy: boolean;
}) {
  const media = listing.assetGallery.length > 0
    ? listing.assetGallery
    : listing.assetImage
      ? [toHttp(listing.assetImage)]
      : [];
  const firstImage = media[0] ?? null;
  const categoryLabel = CATEGORY_LABEL[listing.assetCategory ?? "other"] ?? "RWA";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-preview-title"
      style={modalShell}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={previewCardStyle}>
        <button type="button" aria-label="Close preview" onClick={onClose} style={closeButtonStyle}>
          ×
        </button>
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            minHeight: 260,
            background: firstImage
              ? `linear-gradient(180deg, rgba(2,6,23,0.04), rgba(2,6,23,0.6)), center / cover no-repeat url(${firstImage})`
              : CATEGORY_GRADIENT[listing.assetCategory ?? "other"] ?? CATEGORY_GRADIENT.other,
          }}
        />
        <div style={{ padding: "1.15rem" }}>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
            <CardBadge>{categoryLabel}</CardBadge>
            <CardBadge tone="verified">Verified issuer</CardBadge>
            {listing.assetDelivery ? <CardBadge tone="blue">Physical delivery</CardBadge> : null}
          </div>
          <h2 id="listing-preview-title" style={{ color: "var(--shell-fg)", fontSize: "1.35rem", lineHeight: 1.15, marginBottom: "0.35rem" }}>
            {listing.assetName ?? "(unnamed asset)"}
          </h2>
          <p style={{ color: "var(--shell-muted)", fontSize: "0.86rem", marginBottom: "1rem" }}>
            {listing.assetSymbol ?? "—"} · seller {shorten(listing.seller)}
          </p>

          <div className="nds-grid-3" style={{ gap: "0.65rem", marginBottom: "1rem" }}>
            <PreviewMetric label="Price" value={`$${listing.priceUsdc.toFixed(2)}`} sub="USDC/token" />
            <PreviewMetric label="Supply" value={`${listing.remainingQuantity}/${listing.initialQuantity}`} sub="available" />
            <PreviewMetric label="Jurisdiction" value={listing.assetJurisdictions.slice(0, 2).join(" · ") || "—"} sub="issuer tags" />
          </div>

          {media.length > 1 ? (
            <div style={{ display: "flex", gap: "0.45rem", overflowX: "auto", marginBottom: "1rem" }}>
              {media.slice(0, 6).map((src, idx) => (
                <div
                  key={`${src}-${idx}`}
                  style={{
                    flex: "0 0 76px",
                    height: 54,
                    borderRadius: 8,
                    background: `center / cover no-repeat url(${src})`,
                    border: "1px solid var(--shell-border)",
                  }}
                />
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onBuy}
              disabled={!canBuy}
              style={{
                ...previewPrimaryButtonStyle,
                opacity: canBuy ? 1 : 0.55,
                cursor: canBuy ? "pointer" : "not-allowed",
              }}
            >
              {canBuy ? "Buy now" : "Connect wallet"}
            </button>
            <Link href={`/marketplace/assets/${listing.assetMint}`} style={previewSecondaryButtonStyle}>
              Full details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid var(--shell-border)", borderRadius: 12, padding: "0.75rem", background: "var(--shell-card-alt)" }}>
      <div style={{ color: "var(--shell-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 760 }}>{label}</div>
      <div style={{ color: "var(--shell-fg)", fontSize: "1rem", fontWeight: 800, marginTop: "0.25rem" }}>{value}</div>
      <div style={{ color: "var(--shell-faint)", fontSize: "0.72rem", marginTop: "0.1rem" }}>{sub}</div>
    </div>
  );
}

const modalShell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 110,
  background: "rgba(15, 23, 42, 0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.25rem",
  backdropFilter: "blur(10px)",
};

const previewCardStyle: React.CSSProperties = {
  width: "min(760px, 100%)",
  maxHeight: "calc(100vh - 2.5rem)",
  overflowY: "auto",
  borderRadius: 18,
  border: "1px solid var(--shell-border)",
  background: "var(--shell-card)",
  boxShadow: "0 28px 90px rgba(0,0,0,0.34)",
  position: "relative",
  padding: "0.75rem",
};

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 2,
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(15,23,42,0.7)",
  color: "#fff",
  fontSize: "1.25rem",
  lineHeight: 1,
  cursor: "pointer",
};

const previewPrimaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  background: "#0f172a",
  color: "#fff",
  padding: "0.75rem 1rem",
  fontSize: "0.9rem",
  fontWeight: 760,
};

const previewSecondaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "1px solid var(--shell-border-strong)",
  color: "var(--shell-fg)",
  padding: "0.75rem 1rem",
  fontSize: "0.9rem",
  fontWeight: 760,
  textDecoration: "none",
};

function CardBadge({ children, tone }: { children: React.ReactNode; tone?: "verified" | "blue" }) {
  const colors =
    tone === "verified"
      ? { bg: "rgba(16,185,129,0.9)", fg: "#fff", border: "rgba(255,255,255,0.18)" }
      : tone === "blue"
        ? { bg: "rgba(37,99,235,0.88)", fg: "#fff", border: "rgba(255,255,255,0.18)" }
        : { bg: "rgba(248,250,252,0.94)", fg: "#0f172a", border: "rgba(15,23,42,0.08)" };
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        padding: "0.2rem 0.55rem",
        borderRadius: 999,
        fontSize: "0.68rem",
        fontWeight: 700,
        boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
      }}
    >
      {children}
    </span>
  );
}

function galleryArrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 10,
    transform: "translateY(-50%)",
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.28)",
    background: "rgba(15,23,42,0.64)",
    color: "#fff",
    fontSize: "1.35rem",
    lineHeight: 1,
    cursor: "pointer",
    zIndex: 3,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function BuyModal({
  listing,
  qty,
  submitting,
  feeBps,
  onChange,
  onCancel,
  onSubmit,
  connected,
}: {
  listing: Listing;
  qty: string;
  submitting: boolean;
  feeBps: number;
  onChange: (patch: Partial<{ qty: string }>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  connected: boolean;
}) {
  const qtyNum = Number(qty) || 0;
  const total = listing.priceUsdc * qtyNum;
  const fee = (total * feeBps) / 10_000;
  const sellerShare = total - fee;
  const gradient =
    CATEGORY_GRADIENT[listing.assetCategory ?? "other"] ?? CATEGORY_GRADIENT.other;
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--shell-card)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
          width: 460,
          maxWidth: "90vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
          Buy {listing.assetName ?? listing.assetSymbol ?? "asset"}
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--shell-muted)", marginBottom: "1.25rem" }}>
          You pay in USDC. Tokens are released from the listing vault atomically.
        </p>

        <div
          style={{
            background: "var(--shell-pill-bg)",
            border: "1px solid var(--shell-border)",
            borderRadius: 10,
            padding: "0.9rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 8, background: gradient }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{listing.assetName ?? "(unnamed)"}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--shell-muted)" }}>
              {listing.assetSymbol ?? "—"} · ${listing.priceUsdc.toFixed(2)} per token · {listing.remainingQuantity} available
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, marginBottom: "0.3rem" }}>
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={listing.remainingQuantity}
            style={{
              width: "100%",
              background: "var(--shell-card)",
              border: "1px solid var(--shell-border-strong)",
              borderRadius: 8,
              color: "var(--shell-fg)",
              padding: "0.55rem 0.75rem",
              fontSize: "0.88rem",
              outline: "none",
              fontFamily: "inherit",
            }}
            value={qty}
            onChange={(e) => onChange({ qty: e.target.value })}
          />
        </div>

        <div
          style={{
            background: "var(--shell-pill-bg)",
            border: "1px solid var(--shell-border)",
            borderRadius: 10,
            padding: "0.8rem 1rem",
            fontSize: "0.84rem",
            marginBottom: "1.25rem",
          }}
        >
          <Row k="Subtotal" v={`$${total.toFixed(2)} USDC`} />
          <Row k={`Platform fee (${(feeBps / 100).toFixed(2)}%)`} v={`$${fee.toFixed(2)} USDC`} />
          <Row k="Seller receives" v={`$${sellerShare.toFixed(2)} USDC`} />
          <Row k="You pay" v={`$${total.toFixed(2)} USDC`} bold />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button
            style={{
              background: "var(--shell-card)",
              border: "1px solid var(--shell-border-strong)",
              color: "var(--shell-fg)",
              padding: "0.6rem 1.15rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            style={{
              background: "#4f46e5",
              border: "none",
              color: "#fff",
              padding: "0.6rem 1.35rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: submitting || !connected ? "not-allowed" : "pointer",
              opacity: submitting || !connected ? 0.6 : 1,
              boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
            }}
            onClick={onSubmit}
            disabled={submitting || !connected}
          >
            {submitting ? "Confirming…" : `Buy ${qtyNum} for $${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.25rem 0",
        fontWeight: bold ? 600 : 400,
        color: bold ? "var(--shell-fg)" : "var(--shell-muted)",
      }}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
