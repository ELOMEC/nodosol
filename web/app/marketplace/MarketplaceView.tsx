"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  // Jurisdictions authorised on the asset's issuer (e.g. ["SRB", "MNE"]).
  // Empty if the issuer PDA wasn't found (shouldn't happen for live assets).
  assetJurisdictions: string[];
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; listings: Listing[] }
  | { kind: "error"; message: string };

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

export function MarketplaceView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [buyModal, setBuyModal] = useState<{
    listing: Listing;
    qty: string;
    submitting: boolean;
  } | null>(null);
  const [feeBps, setFeeBps] = useState<number>(250);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "physical" | "digital">("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"newest" | "price_asc" | "price_desc" | "supply">("newest");
  const [search, setSearch] = useState<string>("");
  const toast = useToast();

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // Use a read-only provider even when no wallet is connected.
      const provider = new AnchorProvider(
        connection,
        (wallet?.publicKey ? wallet : { publicKey: PublicKey.default }) as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const market = marketplaceProgram(provider);
      const rwa = mintProgram(provider);
      const registry = registryProgram(provider);

      // Fetch fee once for fee preview + buy calc.
      try {
        const cfg = await fetchMarketplaceConfig(market);
        setFeeBps(cfg.feeBps);
      } catch {
        // ignore — keep default
      }

      // All listings.
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

      // For metadata — fetch all Asset accounts by mint.
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

      // Fetch all Issuers once and index by owner so we can cheaply look
      // up jurisdictions for every listing's asset.issuerOwner.
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

      // Fetch Metaplex-style JSON for each unique metadata URI in parallel and
      // pull out the `image` field. Best-effort — missing / broken URIs just
      // leave the card on its category gradient.
      const uniqueUris = Array.from(
        new Set(
          Array.from(assetByMint.values())
            .map((a) => a.metadataUri)
            .filter((u): u is string => typeof u === "string" && u.length > 0)
        )
      );
      const imageByUri = new Map<string, string>();
      await Promise.all(
        uniqueUris.map(async (uri) => {
          try {
            const httpUri = uri.startsWith("ipfs://")
              ? uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
              : uri;
            const resp = await fetch(httpUri, { cache: "force-cache" });
            if (!resp.ok) return;
            const json = (await resp.json()) as { image?: string };
            if (json.image) imageByUri.set(uri, json.image);
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
            assetJurisdictions: meta
              ? issuerByOwner.get(meta.issuerOwner.toBase58()) ?? []
              : [],
          };
        });
      listings.sort((a, b) => b.createdAt - a.createdAt);
      setState({ kind: "ready", listings });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Fetch failed";
      setState({ kind: "error", message });
    }
  }, [connection, wallet]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
      setBuyModal((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  const allListings = state.kind === "ready" ? state.listings : [];
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Marketplace
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Live tokenised real-world assets from licenced issuers. Buys settle atomically on Solana.
          </p>
        </div>
        <Link
          href="/marketplace/tokenize"
          style={{
            background: "#4f46e5",
            color: "#fff",
            padding: "0.6rem 1.15rem",
            borderRadius: 8,
            fontSize: "0.88rem",
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
          }}
        >
          + Tokenize asset
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Active listings" value={allListings.length.toString()} sub="Live from on-chain" />
        <StatCard
          label="Floor price"
          value={
            allListings.length > 0
              ? `$${Math.min(...allListings.map((l) => l.priceUsdc)).toFixed(2)}`
              : "—"
          }
          sub="Lowest price/token"
        />
        <StatCard label="TVL (listed)" value={`$${totalVolume.toFixed(2)}`} sub="Total listed value" />
        <StatCard label="Platform fee" value={`${(feeBps / 100).toFixed(2)}%`} sub="On every sale" />
      </div>

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
      />

      {state.kind === "loading" ? (
        <CenteredCard>Loading listings from Solana…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed to load: {state.message}</CenteredCard>
      ) : listings.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            No active listings yet
          </div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1.2rem" }}>
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
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "1rem",
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
                disabled={!connected}
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
    </>
  );
}

function toHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");
  }
  return uri;
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
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
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
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1rem 1.1rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.8rem",
      }}
    >
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
                background: active ? "#eef2ff" : "transparent",
                color: active ? "#4338ca" : available ? "#6b7280" : "#d1d5db",
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
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search name, symbol, or seller…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 7,
            color: "#111827",
            padding: "0.5rem 0.75rem",
            fontSize: "0.86rem",
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
        <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
          Showing {filteredCount} of {totalCount} listings
        </div>
      ) : null}
    </div>
  );
}

const filterSelect: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 7,
  color: "#374151",
  padding: "0.5rem 0.7rem",
  fontSize: "0.84rem",
  fontWeight: 500,
  outline: "none",
  cursor: "pointer",
};

function ListingCard({
  listing,
  isOwn,
  onBuy,
  disabled,
}: {
  listing: Listing;
  isOwn: boolean;
  onBuy: () => void;
  disabled: boolean;
}) {
  const gradient =
    CATEGORY_GRADIENT[listing.assetCategory ?? "other"] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[listing.assetCategory ?? "other"] ?? "RWA";
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
<Link
        href={`/marketplace/assets/${listing.assetMint}`}
        style={{
          background: listing.assetImage ? "#111" : gradient,
          height: 130,
          position: "relative",
          textDecoration: "none",
          display: "block",
          overflow: "hidden",
        }}
      >
        {listing.assetImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toHttp(listing.assetImage)}
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
            top: 10,
            left: 10,
            background: "rgba(255,255,255,0.92)",
            padding: "0.18rem 0.55rem",
            borderRadius: 4,
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "#374151",
          }}
        >
          {categoryLabel}
        </div>
        {listing.assetDelivery ? (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              background: "rgba(255,255,255,0.92)",
              color: "#4338ca",
              padding: "0.18rem 0.55rem",
              borderRadius: 4,
              fontSize: "0.68rem",
              fontWeight: 600,
            }}
          >
            Physical delivery
          </div>
        ) : null}
      </Link>
      <div style={{ padding: "0.95rem 1.05rem 1.05rem", display: "flex", flexDirection: "column", flex: 1 }}>
        <Link
          href={`/marketplace/assets/${listing.assetMint}`}
          style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem", lineHeight: 1.3, color: "#111827", textDecoration: "none" }}
        >
          {listing.assetName ?? "(unnamed asset)"}
        </Link>
        <div style={{ fontSize: "0.76rem", color: "#6b7280", marginBottom: "0.5rem" }}>
          {listing.assetSymbol ?? "—"} · seller {shorten(listing.seller)}
        </div>
        {listing.assetJurisdictions.length > 0 ? (
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
            {listing.assetJurisdictions.map((j) => (
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
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>${listing.priceUsdc.toFixed(2)}</div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>per token · USDC</div>
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "#4338ca",
              background: "#eef2ff",
              padding: "0.22rem 0.5rem",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {listing.remainingQuantity}/{listing.initialQuantity} left
          </div>
        </div>
        <button
          onClick={onBuy}
          disabled={disabled || isOwn}
          style={{
            marginTop: "auto",
            background: disabled || isOwn ? "#e5e7eb" : "#4f46e5",
            color: disabled || isOwn ? "#9ca3af" : "#fff",
            border: "none",
            padding: "0.55rem 1rem",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: disabled || isOwn ? "not-allowed" : "pointer",
          }}
        >
          {isOwn ? "Your listing" : disabled ? "Connect wallet to buy" : "Buy"}
        </button>
      </div>
    </div>
  );
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
          background: "#ffffff",
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
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          You pay in USDC. Tokens are released from the listing vault atomically.
        </p>

        <div
          style={{
            background: "#f7f8fa",
            border: "1px solid #eef0f3",
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
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              {listing.assetSymbol ?? "—"} · ${listing.priceUsdc.toFixed(2)} per token · {listing.remainingQuantity} available
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.3rem" }}>
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={listing.remainingQuantity}
            style={{
              width: "100%",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              color: "#111827",
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
            background: "#f7f8fa",
            border: "1px solid #eef0f3",
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
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#374151",
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
        color: bold ? "#111827" : "#4b5563",
      }}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
