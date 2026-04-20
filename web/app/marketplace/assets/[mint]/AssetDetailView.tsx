"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  decodeListingStatus,
  fetchMarketplaceConfig,
  listingPda,
  listingVaultPda,
  marketplaceProgram,
} from "@/lib/marketplace";
import {
  assetClassLabels,
  decodeIssuerStatus,
  issuerPda,
  IssuerStatusKey,
  jurisdictionsToString,
  mintProgram,
  registryProgram,
} from "@/lib/rwa";

type AssetDoc = {
  address: string;
  issuerOwner: string;
  mint: string;
  assetId: string;
  category: string;
  status: "Active" | "Paused" | "Retired";
  quantity: number;
  burned: number;
  deliveryRequired: boolean;
  name: string;
  symbol: string;
  metadataUri: string;
  createdAt: number;
};

type IssuerDoc = {
  status: IssuerStatusKey;
  jurisdictions: string[];
  assetClasses: string[];
  kycRef: string;
};

type ListingDoc = {
  address: string;
  seller: string;
  priceUsdc: number;
  pricePerTokenBaseUnits: bigint;
  initialQuantity: number;
  remainingQuantity: number;
  status: "active" | "cancelled" | "soldOut";
  paymentMint: string;
};

type AssetMediaDoc = {
  image: string | null;
  description: string | null;
};

type FetchState =
  | { kind: "loading" }
  | {
      kind: "ready";
      asset: AssetDoc | null;
      issuer: IssuerDoc | null;
      listings: ListingDoc[];
      media: AssetMediaDoc | null;
    }
  | { kind: "error"; message: string };

const CATEGORY_LABEL: Record<string, string> = {
  commodity: "Commodity",
  realEstate: "Real Estate",
  debt: "Debt",
  equity: "Equity",
  ticket: "Ticket",
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

export function AssetDetailView({ mint }: { mint: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [buyQty, setBuyQty] = useState("1");
  const [buyingListing, setBuyingListing] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState(250);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      let mintKey: PublicKey;
      try {
        mintKey = new PublicKey(mint);
      } catch {
        setState({ kind: "error", message: "Invalid mint address" });
        return;
      }

      // Use connected wallet if available; otherwise a read-only dummy.
      const walletAdapter = publicKey ? (wallet as unknown as Wallet) : (new ReadOnlyWallet() as unknown as Wallet);
      const provider = new AnchorProvider(connection, walletAdapter, {
        commitment: "confirmed",
      });
      const rwa = mintProgram(provider);
      const registry = registryProgram(provider);
      const market = marketplaceProgram(provider);

      try {
        const cfg = await fetchMarketplaceConfig(market);
        setFeeBps(cfg.feeBps);
      } catch {
        // keep default
      }

      // Asset PDA: search by mint field (offset 8 + 32 = 40).
      const assetApi = (rwa.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            issuerOwner: PublicKey;
            mint: PublicKey;
            assetId: BN;
            category: Record<string, unknown>;
            status: Record<string, unknown>;
            quantity: BN;
            burnedAmount: BN;
            deliveryRequired: boolean;
            name: string;
            symbol: string;
            metadataUri: string;
            createdAt: BN;
          };
        }>>;
      }>).asset;
      const assetItems = await assetApi.all([
        { memcmp: { offset: 40, bytes: mintKey.toBase58() } },
      ]);
      const assetItem = assetItems[0];
      const asset: AssetDoc | null = assetItem
        ? {
            address: assetItem.publicKey.toBase58(),
            issuerOwner: assetItem.account.issuerOwner.toBase58(),
            mint: assetItem.account.mint.toBase58(),
            assetId: assetItem.account.assetId.toString(),
            category: decodeCategory(assetItem.account.category),
            status: decodeAssetStatus(assetItem.account.status),
            quantity: assetItem.account.quantity.toNumber(),
            burned: assetItem.account.burnedAmount.toNumber(),
            deliveryRequired: assetItem.account.deliveryRequired,
            name: assetItem.account.name,
            symbol: assetItem.account.symbol,
            metadataUri: assetItem.account.metadataUri,
            createdAt: assetItem.account.createdAt.toNumber(),
          }
        : null;

      let issuer: IssuerDoc | null = null;
      if (asset) {
        const [issuerAddr] = issuerPda(new PublicKey(asset.issuerOwner));
        try {
          const issuerApi = (registry.account as Record<string, {
            fetchNullable: (addr: PublicKey) => Promise<{
              status: Record<string, unknown>;
              jurisdictions: number[][];
              assetClasses: number;
              kycRef: string;
            } | null>;
          }>).issuer;
          const raw = await issuerApi.fetchNullable(issuerAddr);
          if (raw) {
            issuer = {
              status: decodeIssuerStatus(raw.status),
              jurisdictions: jurisdictionsToString(raw.jurisdictions),
              assetClasses: assetClassLabels(raw.assetClasses),
              kycRef: raw.kycRef,
            };
          }
        } catch {
          issuer = null;
        }
      }

      // Listings for this mint (marketplace Listing.asset_mint at offset 40).
      const listingApi = (market.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            seller: PublicKey;
            assetMint: PublicKey;
            paymentMint: PublicKey;
            pricePerToken: BN;
            initialQuantity: BN;
            remainingQuantity: BN;
            status: Record<string, unknown>;
          };
        }>>;
      }>).listing;
      const listingItems = await listingApi.all([
        { memcmp: { offset: 40, bytes: mintKey.toBase58() } },
      ]);
      const listings: ListingDoc[] = listingItems
        .map(({ publicKey: addr, account }) => {
          const priceBase = BigInt(account.pricePerToken.toString());
          return {
            address: addr.toBase58(),
            seller: account.seller.toBase58(),
            priceUsdc: Number(priceBase) / USDC_UNIT,
            pricePerTokenBaseUnits: priceBase,
            initialQuantity: account.initialQuantity.toNumber(),
            remainingQuantity: account.remainingQuantity.toNumber(),
            status: decodeListingStatus(account.status),
            paymentMint: account.paymentMint.toBase58(),
          };
        })
        .sort((a, b) => {
          // Active first, then sold out, then cancelled.
          const order = (s: ListingDoc["status"]) =>
            s === "active" ? 0 : s === "soldOut" ? 1 : 2;
          return order(a.status) - order(b.status) || a.priceUsdc - b.priceUsdc;
        });

      let media: AssetMediaDoc | null = null;
      if (asset?.metadataUri) {
        const httpUri = asset.metadataUri.startsWith("ipfs://")
          ? asset.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
          : asset.metadataUri;
        try {
          const resp = await fetch(httpUri, { cache: "no-store" });
          if (resp.ok) {
            const ct = resp.headers.get("content-type") ?? "";
            if (ct.includes("application/json") || httpUri.endsWith(".json")) {
              const json = (await resp.json()) as { image?: string; description?: string };
              media = { image: json.image ?? null, description: json.description ?? null };
            }
          }
        } catch {
          // metadata fetch is best-effort; leave media null
        }
      }

      setState({ kind: "ready", asset, issuer, listings, media });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, mint, publicKey, wallet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function buyFromListing(listing: ListingDoc) {
    if (!publicKey || !state || state.kind !== "ready" || !state.asset) return;
    const qtyNum = Number(buyQty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > listing.remainingQuantity) {
      window.alert("Invalid quantity");
      return;
    }
    setBuyingListing(listing.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(state.asset.mint);
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

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setBuyQty("1");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setBuyingListing(null);
    }
  }

  if (state.kind === "loading") {
    return <CenteredCard>Loading asset from Solana…</CenteredCard>;
  }
  if (state.kind === "error") {
    return <CenteredCard>Failed to load: {state.message}</CenteredCard>;
  }
  if (!state.asset) {
    return (
      <>
        <Back />
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            Asset not found
          </div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280" }}>
            No RWA Asset PDA is registered for mint{" "}
            <code style={code}>{shorten(mint)}</code>.
          </div>
        </CenteredCard>
      </>
    );
  }

  const { asset, issuer, listings, media } = state;
  const circulating = asset.quantity - asset.burned;
  const activeListings = listings.filter((l) => l.status === "active");
  const cheapest = activeListings[0] ?? null;
  const isOwn = connected && publicKey && publicKey.toBase58() === asset.issuerOwner;
  const gradient = CATEGORY_GRADIENT[asset.category] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[asset.category] ?? "RWA";

  return (
    <>
      <Back />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "1.5rem", alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              background: media?.image ? "#111" : gradient,
              height: media?.image ? 340 : 200,
              borderRadius: 14,
              marginBottom: "1.25rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {media?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.image}
                alt={asset.name}
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
                bottom: 16,
                left: 16,
                display: "flex",
                gap: "0.45rem",
                flexWrap: "wrap",
              }}
            >
              <Badge>{categoryLabel}</Badge>
              {asset.deliveryRequired ? <Badge>Physical delivery</Badge> : <Badge>Digital</Badge>}
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>

          {media?.description ? (
            <Panel title="Description">
              <div style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {media.description}
              </div>
            </Panel>
          ) : null}

          <h1 style={{ fontSize: "1.85rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>
            {asset.name || "(unnamed asset)"}
          </h1>
          <div style={{ fontSize: "0.9rem", color: "#6b7280", marginBottom: "1.5rem" }}>
            {asset.symbol} · <code style={code}>{shorten(asset.mint)}</code>
          </div>

          <Panel title="Overview">
            <KV k="Category" v={categoryLabel} />
            <KV k="Total supply" v={`${asset.quantity} ${asset.symbol}`} />
            <KV k="Circulating" v={`${circulating} ${asset.symbol}`} />
            <KV k="Burned" v={asset.burned.toString()} />
            <KV k="Delivery" v={asset.deliveryRequired ? "Physical fulfilment" : "Digital only"} />
            <KV k="Mint standard" v="Token-2022 (fixed supply)" />
            <KV k="Asset ID" v={asset.assetId} />
            <KV k="Tokenised" v={new Date(asset.createdAt * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
          </Panel>

          <Panel title="Issuer">
            {issuer ? (
              <>
                <KV k="Wallet" v={shorten(asset.issuerOwner)} />
                <KV k="Status" v={<IssuerPill status={issuer.status} />} />
                <KV k="Jurisdictions" v={issuer.jurisdictions.join(", ") || "—"} />
                <KV k="Authorised classes" v={issuer.assetClasses.join(" · ") || "—"} />
                <KV k="KYC ref" v={issuer.kycRef} />
              </>
            ) : (
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Issuer record not found.</div>
            )}
          </Panel>

          {asset.metadataUri ? (
            <Panel title="Metadata">
              <div style={{ fontSize: "0.84rem", color: "#4b5563", wordBreak: "break-all" }}>
                <a
                  href={asset.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#4338ca", textDecoration: "none", fontWeight: 500 }}
                >
                  {asset.metadataUri} ↗
                </a>
              </div>
            </Panel>
          ) : null}
        </div>

        <aside style={{ position: "sticky", top: 88, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={panel}>
            <div style={panelHeader}>Marketplace</div>
            <div style={{ padding: "1.1rem 1.2rem" }}>
              {cheapest ? (
                <>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.3rem", fontWeight: 500 }}>
                    Lowest listing
                  </div>
                  <div style={{ fontSize: "1.85rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
                    ${cheapest.priceUsdc.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginBottom: "1rem" }}>
                    per {asset.symbol} · {cheapest.remainingQuantity} of {cheapest.initialQuantity} left
                  </div>

                  {!connected ? (
                    <WalletMultiButton style={{ width: "100%" }} />
                  ) : isOwn ? (
                    <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>You are the issuer.</div>
                  ) : publicKey?.toBase58() === cheapest.seller ? (
                    <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>This is your listing.</div>
                  ) : (
                    <>
                      <label style={{ fontSize: "0.78rem", color: "#374151", fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>
                        Quantity
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={cheapest.remainingQuantity}
                        value={buyQty}
                        onChange={(e) => setBuyQty(e.target.value)}
                        style={input}
                      />
                      <BuySummary
                        qty={Number(buyQty) || 0}
                        price={cheapest.priceUsdc}
                        feeBps={feeBps}
                      />
                      <button
                        onClick={() => void buyFromListing(cheapest)}
                        disabled={buyingListing === cheapest.address}
                        style={{
                          ...btnPrimary,
                          width: "100%",
                          marginTop: "0.75rem",
                          opacity: buyingListing === cheapest.address ? 0.6 : 1,
                        }}
                      >
                        {buyingListing === cheapest.address
                          ? "Confirming…"
                          : `Buy ${buyQty || 0} for $${((Number(buyQty) || 0) * cheapest.priceUsdc).toFixed(2)}`}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#111827", marginBottom: "0.35rem" }}>
                    Not for sale
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
                    No active marketplace listings for this asset.
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeListings.length > 1 ? (
            <div style={panel}>
              <div style={panelHeader}>All active listings ({activeListings.length})</div>
              <div style={{ padding: "0.4rem 0" }}>
                {activeListings.map((l) => (
                  <div
                    key={l.address}
                    style={{
                      padding: "0.6rem 1rem",
                      borderBottom: "1px solid #f3f4f6",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.84rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>${l.priceUsdc.toFixed(2)}</div>
                      <div style={{ fontSize: "0.74rem", color: "#9ca3af" }}>
                        by {shorten(l.seller)} · {l.remainingQuantity} left
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {listings.filter((l) => l.status !== "active").length > 0 ? (
            <div style={panel}>
              <div style={panelHeader}>Closed listings</div>
              <div style={{ padding: "0.4rem 0" }}>
                {listings
                  .filter((l) => l.status !== "active")
                  .map((l) => (
                    <div
                      key={l.address}
                      style={{
                        padding: "0.55rem 1rem",
                        borderBottom: "1px solid #f3f4f6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                        color: "#6b7280",
                      }}
                    >
                      <span>${l.priceUsdc.toFixed(2)} × {l.initialQuantity}</span>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                        {l.status === "soldOut" ? "Sold out" : "Cancelled"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function BuySummary({ qty, price, feeBps }: { qty: number; price: number; feeBps: number }) {
  const total = qty * price;
  const fee = (total * feeBps) / 10_000;
  const sellerShare = total - fee;
  if (qty <= 0) return null;
  return (
    <div
      style={{
        background: "#f7f8fa",
        border: "1px solid #eef0f3",
        borderRadius: 8,
        padding: "0.6rem 0.8rem",
        fontSize: "0.8rem",
        marginTop: "0.75rem",
      }}
    >
      <Row k="Subtotal" v={`$${total.toFixed(2)}`} />
      <Row k={`Fee (${(feeBps / 100).toFixed(2)}%)`} v={`$${fee.toFixed(2)}`} />
      <Row k="Seller receives" v={`$${sellerShare.toFixed(2)}`} />
      <Row k="You pay" v={`$${total.toFixed(2)}`} bold />
    </div>
  );
}

function Back() {
  return (
    <Link
      href="/marketplace"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        color: "#6b7280",
        textDecoration: "none",
        fontSize: "0.86rem",
        marginBottom: "1rem",
      }}
    >
      ← Back to marketplace
    </Link>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "rgba(255,255,255,0.94)",
        padding: "0.22rem 0.65rem",
        borderRadius: 5,
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#374151",
      }}
    >
      {children}
    </span>
  );
}

function AssetStatusBadge({ status }: { status: "Active" | "Paused" | "Retired" }) {
  const map = {
    Active: { bg: "rgba(16,185,129,0.94)", fg: "#fff" },
    Paused: { bg: "rgba(245,158,11,0.94)", fg: "#fff" },
    Retired: { bg: "rgba(107,114,128,0.94)", fg: "#fff" },
  };
  const c = map[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "0.22rem 0.65rem",
        borderRadius: 5,
        fontSize: "0.72rem",
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

function IssuerPill({ status }: { status: IssuerStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    pending: { bg: "rgba(234,179,8,0.12)", fg: "#854d0e", dot: "#eab308", label: "Pending" },
    suspended: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Suspended" },
    revoked: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Revoked" },
  };
  const c = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: c.bg,
        color: c.fg,
        padding: "0.18rem 0.5rem",
        borderRadius: 4,
        fontSize: "0.72rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        marginBottom: "1rem",
      }}
    >
      <h3 style={{ fontSize: "0.82rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: "0.85rem" }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.88rem" }}>
      <span style={{ color: "#6b7280" }}>{k}</span>
      <span style={{ color: "#111827", fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.2rem 0",
        fontWeight: bold ? 600 : 400,
        color: bold ? "#111827" : "#4b5563",
      }}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Back />
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
    </>
  );
}

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function decodeAssetStatus(raw: Record<string, unknown>): "Active" | "Paused" | "Retired" {
  if ("active" in raw) return "Active";
  if ("paused" in raw) return "Paused";
  if ("retired" in raw) return "Retired";
  return "Active";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #eef0f3",
  borderRadius: 12,
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  padding: "0.85rem 1rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#111827",
  borderBottom: "1px solid #eef0f3",
  background: "#fafbfc",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#111827",
  padding: "0.55rem 0.75rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.65rem 1.25rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
};

const code: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#4338ca",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.78rem",
  fontFamily: "'SF Mono', Menlo, monospace",
};
