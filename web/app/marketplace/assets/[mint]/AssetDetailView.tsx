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

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
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
import { decodeDealStatus, DealStatusKey, otcProgram } from "@/lib/otc";
import { simulateAndSend } from "@/lib/tx";
import { isChatAllowed } from "@/lib/supabase";
import { explainSolanaError } from "@/lib/solanaErrors";
import { ContactSellerButton } from "@/components/ContactSellerButton";
import { LocationView } from "@/components/LocationView";
import { useToast } from "@/components/ToastProvider";
import { VideoEmbed } from "@/components/VideoEmbed";

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

type OtcDealRow = {
  address: string;
  seller: string;
  buyer: string;
  quantity: number;
  totalPriceUsdc: number;
  status: DealStatusKey;
  createdAt: number;
  expiresAt: number;
};

type AssetMediaDoc = {
  image: string | null;
  description: string | null;
  gallery: string[];
  videoUrl: string | null;
  location: {
    address: string;
    lat: number;
    lng: number;
    polygon?: Array<{ lat: number; lng: number }>;
  } | null;
  attributes: Array<{ trait_type: string; value: string | number }>;
  allowChat: boolean;
};

type FetchState =
  | { kind: "loading" }
  | {
      kind: "ready";
      asset: AssetDoc | null;
      issuer: IssuerDoc | null;
      listings: ListingDoc[];
      media: AssetMediaDoc | null;
      deals: OtcDealRow[];
      viewerBalance: number;
    }
  | { kind: "error"; message: string };

type ListForm = {
  qty: string;
  price: string;
  submitting: boolean;
};

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
  const toast = useToast();
  const [listForm, setListForm] = useState<ListForm | null>(null);
  const [editPrice, setEditPrice] = useState<{
    listing: ListingDoc;
    price: string;
    submitting: boolean;
  } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

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
      const otc = otcProgram(provider);

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

      // OTC deals that reference this mint. Deal fields in order:
      //   seller (32) @ 8, buyer (32) @ 40, assetMint (32) @ 72, ...
      const dealAccountApi = (otc.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            seller: PublicKey;
            buyer: PublicKey;
            assetMint: PublicKey;
            quantity: BN;
            totalPrice: BN;
            status: Record<string, unknown>;
            expiresAt: BN;
            createdAt: BN;
          };
        }>>;
      }>).deal;
      let deals: OtcDealRow[] = [];
      try {
        const rawDeals = await dealAccountApi.all([
          { memcmp: { offset: 72, bytes: mintKey.toBase58() } },
        ]);
        deals = rawDeals
          .map(({ publicKey: addr, account }) => ({
            address: addr.toBase58(),
            seller: account.seller.toBase58(),
            buyer: account.buyer.toBase58(),
            quantity: account.quantity.toNumber(),
            totalPriceUsdc: Number(BigInt(account.totalPrice.toString())) / USDC_UNIT,
            status: decodeDealStatus(account.status),
            createdAt: account.createdAt.toNumber(),
            expiresAt: account.expiresAt.toNumber(),
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
      } catch (err) {
        console.warn("OTC deal lookup failed", err);
      }

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
              const json = (await resp.json()) as {
                image?: string;
                description?: string;
                gallery?: string[];
                videoUrl?: string;
                location?: {
                  address: string;
                  lat: number;
                  lng: number;
                  polygon?: Array<{ lat: number; lng: number }>;
                };
                attributes?: Array<{ trait_type: string; value: string | number }>;
                properties?: { allow_chat?: boolean };
              };
              // Gallery: if metadata declares a gallery, use it; drop any
              // occurrences of the cover image (image[0] convention from
              // tokenize form) to avoid showing the same photo twice.
              const rawGallery = json.gallery ?? [];
              const gallery = json.image
                ? rawGallery.filter((g) => g !== json.image)
                : rawGallery;
              media = {
                image: json.image ?? null,
                description: json.description ?? null,
                gallery,
                videoUrl: json.videoUrl ?? null,
                location: json.location ?? null,
                attributes: json.attributes ?? [],
                allowChat:
                  typeof json.properties?.allow_chat === "boolean"
                    ? json.properties.allow_chat
                    : true,
              };
            }
          }
        } catch {
          // metadata fetch is best-effort; leave media null
        }
      }

      // Viewer token balance for this mint — best-effort. ATA may not
      // exist (balance 0); any RPC error also lands us on 0 silently.
      let viewerBalance = 0;
      if (publicKey && asset) {
        try {
          const ata = getAssociatedTokenAddressSync(
            mintKey,
            publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
          );
          const bal = await connection.getTokenAccountBalance(ata);
          viewerBalance = Number(bal.value.amount);
        } catch {
          viewerBalance = 0;
        }
      }

      setState({ kind: "ready", asset, issuer, listings, media, deals, viewerBalance });
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

      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ix,
        ],
      });
      setBuyQty("1");
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBuyingListing(null);
    }
  }

  async function submitListing() {
    if (!publicKey || !state || state.kind !== "ready" || !state.asset || !listForm) return;
    const priceNum = Number(listForm.price);
    const qtyNum = Number(listForm.qty);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      window.alert("Invalid price");
      return;
    }
    const maxQty = state.viewerBalance;
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > maxQty) {
      window.alert(`Invalid quantity (max ${maxQty})`);
      return;
    }
    setListForm({ ...listForm, submitting: true });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(state.asset.mint);
      const paymentMint = getUsdcMint();
      const sellerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const [listing] = listingPda(publicKey, assetMint);
      const [vault] = listingVaultPda(listing);
      const priceBaseUnits = BigInt(Math.round(priceNum * USDC_UNIT));

      const ix = await program.methods
        .createListing(new BN(priceBaseUnits.toString()), new BN(qtyNum))
        .accounts({
          seller: publicKey,
          assetMint,
          paymentMint,
          listing,
          vault,
          sellerAssetAccount: sellerAssetAta,
          assetTokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
          ix,
        ],
      });
      setListForm(null);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
      setListForm((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  async function submitEditPrice() {
    if (!editPrice || !publicKey || state.kind !== "ready" || !state.asset) return;
    const priceNum = Number(editPrice.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      window.alert("Invalid price");
      return;
    }
    setEditPrice({ ...editPrice, submitting: true });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(state.asset.mint);
      const [listingAddr] = listingPda(publicKey, assetMint);
      const priceBaseUnits = BigInt(Math.round(priceNum * USDC_UNIT));

      const ix = await program.methods
        .updateListingPrice(new BN(priceBaseUnits.toString()))
        .accounts({
          seller: publicKey,
          listing: listingAddr,
        })
        .instruction();
      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [ix],
      });
      setEditPrice(null);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
      setEditPrice((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  async function cancelOwnListing(listing: ListingDoc) {
    if (!publicKey || state.kind !== "ready" || !state.asset) return;
    if (
      !window.confirm(
        `Cancel this listing? ${listing.remainingQuantity} token${listing.remainingQuantity === 1 ? "" : "s"} will be returned to your wallet.`,
      )
    ) {
      return;
    }
    setCancelling(listing.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(state.asset.mint);
      const sellerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );
      const [listingAddr] = listingPda(publicKey, assetMint);
      const [vault] = listingVaultPda(listingAddr);
      const ix = await program.methods
        .cancelListing()
        .accounts({
          seller: publicKey,
          assetMint,
          listing: listingAddr,
          vault,
          sellerAssetAccount: sellerAssetAta,
          assetTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
          ix,
        ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setCancelling(null);
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
          <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            Asset not found
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)" }}>
            No RWA Asset PDA is registered for mint{" "}
            <code style={code}>{shorten(mint)}</code>.
          </div>
        </CenteredCard>
      </>
    );
  }

  const { asset, issuer, listings, media, deals, viewerBalance } = state;
  const circulating = asset.quantity - asset.burned;
  const activeListings = listings.filter((l) => l.status === "active");
  const cheapest = activeListings[0] ?? null;
  const isOwn = connected && publicKey && publicKey.toBase58() === asset.issuerOwner;
  const gradient = CATEGORY_GRADIENT[asset.category] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[asset.category] ?? "RWA";
  const mediaImages = uniqueStrings([media?.image ?? null, ...(media?.gallery ?? [])]);
  const heroImage = mediaImages[activeImage] ?? mediaImages[0] ?? null;
  const listedPct = asset.quantity > 0
    ? Math.max(0, Math.min(100, (activeListings.reduce((sum, l) => sum + l.remainingQuantity, 0) / asset.quantity) * 100))
    : 0;

  return (
    <>
      <Back />

      <section
        style={{
          background: "var(--shell-card)",
          border: "1px solid var(--shell-border)",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "var(--brand-shadow)",
          marginBottom: "1.25rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.9fr)",
            gap: 0,
          }}
          className="nds-asset-hero-grid"
        >
          <div
            style={{
              background: heroImage ? "#0f172a" : gradient,
              minHeight: 460,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImage}
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
                inset: 0,
                background: "linear-gradient(180deg, rgba(2,6,23,0.05) 20%, rgba(2,6,23,0.68) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 22,
                right: 22,
                bottom: 22,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <Badge>{categoryLabel}</Badge>
                {asset.deliveryRequired ? <Badge>Physical delivery</Badge> : <Badge>Digital</Badge>}
                <AssetStatusBadge status={asset.status} />
              </div>
              {mediaImages.length > 1 ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {mediaImages.slice(0, 5).map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      aria-label={`Show photo ${i + 1}`}
                      onClick={() => setActiveImage(i)}
                      style={{
                        width: 54,
                        height: 42,
                        borderRadius: 8,
                        border: i === activeImage ? "2px solid #fff" : "1px solid rgba(255,255,255,0.36)",
                        padding: 0,
                        overflow: "hidden",
                        cursor: "pointer",
                        background: "rgba(15,23,42,0.58)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ padding: "2rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "1.5rem" }}>
            <div>
              <div style={{ color: "var(--shell-link)", fontSize: "0.76rem", fontWeight: 750, letterSpacing: 1, textTransform: "uppercase", marginBottom: "0.75rem" }}>
                Verified asset dossier
              </div>
              <h1 style={{ fontSize: "2.7rem", lineHeight: 1.05, fontWeight: 760, letterSpacing: 0, marginBottom: "0.85rem" }}>
                {asset.name || "(unnamed asset)"}
              </h1>
              <div style={{ fontSize: "0.92rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
                {asset.symbol} · <code style={code}>{shorten(asset.mint)}</code>
              </div>
              {media?.description ? (
                <p style={{ color: "var(--shell-muted)", fontSize: "0.96rem", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: "1.25rem" }}>
                  {media.description}
                </p>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.65rem" }}>
                <HeroStat label="Supply" value={`${circulating}/${asset.quantity}`} sub={asset.symbol} />
                <HeroStat label="Floor" value={cheapest ? `$${cheapest.priceUsdc.toFixed(2)}` : "Not listed"} sub="USDC / token" />
                <HeroStat label="Issuer" value={issuer ? issuer.status : "Unknown"} sub={issuer?.jurisdictions.join(" · ") || "No record"} />
                <HeroStat label="Listed" value={`${Math.round(listedPct)}%`} sub={`${activeListings.length} active listings`} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
              <ContactSellerButton
                listingKind="asset"
                listingPda={asset.address}
                sellerPubkey={asset.issuerOwner}
                allowChat={isChatAllowed(media)}
                label="Contact owner"
              />
              <a
                href={asset.metadataUri ? asset.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/") : "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid var(--shell-border-strong)",
                  borderRadius: 8,
                  color: "var(--shell-fg)",
                  padding: "0.58rem 0.9rem",
                  fontSize: "0.84rem",
                  fontWeight: 700,
                  textDecoration: "none",
                  pointerEvents: asset.metadataUri ? "auto" : "none",
                  opacity: asset.metadataUri ? 1 : 0.45,
                }}
              >
                Metadata
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="nds-grid-detail">
        <div>
          <Panel title="Overview">
            <div className="nds-grid-2" style={{ gap: "0.7rem" }}>
              <DossierTile label="Category" value={categoryLabel} />
              <DossierTile label="Delivery" value={asset.deliveryRequired ? "Physical fulfilment" : "Digital only"} />
              <DossierTile label="Mint standard" value="Token-2022" />
              <DossierTile label="Asset ID" value={asset.assetId} />
              <DossierTile label="Tokenised" value={new Date(asset.createdAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
              <DossierTile label="Burned" value={asset.burned.toString()} />
            </div>
          </Panel>

          {media?.attributes && media.attributes.length > 0 ? (
            <Panel title="Attributes">
              {media.attributes.map((attr, i) => (
                <KV key={`${attr.trait_type}-${i}`} k={attr.trait_type} v={String(attr.value)} />
              ))}
            </Panel>
          ) : null}

          {media?.videoUrl ? (
            <Panel title="Video">
              <VideoEmbed url={media.videoUrl} title={asset.name} />
            </Panel>
          ) : null}

          {media?.location ? (
            <Panel title="Location">
              <div style={{ fontSize: "0.85rem", color: "var(--shell-fg)", marginBottom: "0.55rem" }}>
                {media.location.address}
              </div>
              <LocationView location={media.location} />
            </Panel>
          ) : null}

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
              <div style={{ fontSize: "0.85rem", color: "var(--shell-muted)" }}>Issuer record not found.</div>
            )}
          </Panel>

          {asset.metadataUri ? (
            <Panel title="Metadata">
              <div style={{ fontSize: "0.84rem", color: "var(--shell-muted)", wordBreak: "break-all" }}>
                <a
                  href={asset.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--shell-link)", textDecoration: "none", fontWeight: 500 }}
                >
                  {asset.metadataUri} ↗
                </a>
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="nds-no-sticky-mobile" style={{ position: "sticky", top: 154, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={checkoutPanel}>
            <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid var(--shell-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.9rem" }}>
                <div>
                  <div style={{ fontSize: "0.74rem", color: "var(--shell-muted)", fontWeight: 750, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Primary market
                  </div>
                  <div style={{ color: "var(--shell-fg)", fontSize: "1.05rem", fontWeight: 750, marginTop: "0.15rem" }}>
                    {cheapest ? "Available now" : "Not listed"}
                  </div>
                </div>
                <span
                  style={{
                    border: "1px solid rgba(22,163,74,0.22)",
                    background: "rgba(22,163,74,0.08)",
                    color: "#15803d",
                    borderRadius: 999,
                    padding: "0.28rem 0.55rem",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                  }}
                >
                  Escrowed
                </span>
              </div>

              {cheapest ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <div style={{ fontSize: "2.25rem", lineHeight: 1, fontWeight: 780, letterSpacing: 0 }}>
                        ${cheapest.priceUsdc.toFixed(2)}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--shell-faint)", marginTop: "0.35rem" }}>
                        per {asset.symbol}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 750, color: "var(--shell-fg)" }}>
                        {cheapest.remainingQuantity}/{cheapest.initialQuantity}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)" }}>tokens left</div>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--shell-border)", marginTop: "0.9rem", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(0, Math.min(100, (cheapest.remainingQuantity / cheapest.initialQuantity) * 100))}%`,
                        background: "linear-gradient(90deg, #2563eb, #16a34a)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", lineHeight: 1.55 }}>
                  No active marketplace listing is available for this asset.
                </div>
              )}
            </div>

            <div style={{ padding: "1.25rem" }}>
              {cheapest ? (
                !connected ? (
                  <>
                    <div style={trustNoteStyle}>
                      Connect a wallet to review quantity and sign a single atomic USDC settlement transaction.
                    </div>
                    <WalletMultiButton style={{ width: "100%" }} />
                  </>
                ) : publicKey?.toBase58() === cheapest.seller ? (
                  <SellerActions
                    listing={cheapest}
                    onEdit={() =>
                      setEditPrice({
                        listing: cheapest,
                        price: cheapest.priceUsdc.toString(),
                        submitting: false,
                      })
                    }
                    onCancel={() => void cancelOwnListing(cheapest)}
                    cancelling={cancelling === cheapest.address}
                  />
                ) : isOwn ? (
                  <div style={trustNoteStyle}>You are the issuer of this asset.</div>
                ) : (
                  <CheckoutControls
                    symbol={asset.symbol}
                    qty={buyQty}
                    maxQty={cheapest.remainingQuantity}
                    price={cheapest.priceUsdc}
                    feeBps={feeBps}
                    confirming={buyingListing === cheapest.address}
                    onQty={setBuyQty}
                    onSubmit={() => void buyFromListing(cheapest)}
                  />
                )
              ) : (
                <ContactSellerButton
                  listingKind="asset"
                  listingPda={asset.address}
                  sellerPubkey={asset.issuerOwner}
                  allowChat={isChatAllowed(media)}
                  label="Contact owner"
                />
              )}
            </div>
          </div>

          {activeListings.length > 1 ? (
            <div style={panel}>
              <div style={panelHeader}>All active listings ({activeListings.length})</div>
              <div style={{ padding: "0.4rem 0" }}>
                {activeListings.map((l) => {
                  const mine = publicKey?.toBase58() === l.seller;
                  return (
                    <div
                      key={l.address}
                      style={{
                        padding: "0.6rem 1rem",
                        borderBottom: "1px solid var(--shell-divider)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.84rem",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>${l.priceUsdc.toFixed(2)}</div>
                        <div style={{ fontSize: "0.74rem", color: "var(--shell-faint)" }}>
                          by {mine ? "you" : shorten(l.seller)} · {l.remainingQuantity} left
                        </div>
                      </div>
                      {mine ? (
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            onClick={() =>
                              setEditPrice({
                                listing: l,
                                price: l.priceUsdc.toString(),
                                submitting: false,
                              })
                            }
                            style={rowActBtn}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void cancelOwnListing(l)}
                            disabled={cancelling === l.address}
                            style={rowActBtn}
                          >
                            {cancelling === l.address ? "…" : "Cancel"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
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
                        borderBottom: "1px solid var(--shell-divider)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                        color: "var(--shell-muted)",
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

          {deals.length > 0 ? (
            <div style={panel}>
              <div style={panelHeader}>
                OTC activity ({deals.length})
              </div>
              <div style={{ padding: "0.4rem 0" }}>
                {deals.map((d) => (
                  <DealRow
                    key={d.address}
                    deal={d}
                    viewer={publicKey?.toBase58() ?? null}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {viewerHoldsTokens(viewerBalance, publicKey?.toBase58() ?? null, listings) ? (
            <div style={panel}>
              <div style={panelHeader}>Your holding</div>
              <div style={{ padding: "1rem 1.2rem" }}>
                <div style={{ fontSize: "0.82rem", color: "var(--shell-muted)", marginBottom: "0.35rem" }}>
                  Balance
                </div>
                <div style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: 0 }}>
                  {viewerBalance} {asset.symbol}
                </div>
                <button
                  onClick={() =>
                    setListForm({ qty: viewerBalance.toString(), price: "1", submitting: false })
                  }
                  style={{
                    ...btnPrimary,
                    width: "100%",
                    marginTop: "0.85rem",
                  }}
                >
                  List these tokens
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {listForm && asset ? (
        <ListModal
          symbol={asset.symbol}
          maxQty={viewerBalance}
          form={listForm}
          onChange={setListForm}
          onSubmit={() => void submitListing()}
          onClose={() => setListForm(null)}
        />
      ) : null}

      {editPrice && asset ? (
        <EditPriceModal
          symbol={asset.symbol}
          currentPrice={editPrice.listing.priceUsdc}
          remainingQty={editPrice.listing.remainingQuantity}
          price={editPrice.price}
          submitting={editPrice.submitting}
          onChange={(p) => setEditPrice({ ...editPrice, price: p })}
          onSubmit={() => void submitEditPrice()}
          onClose={() => setEditPrice(null)}
        />
      ) : null}
    </>
  );
}

function SellerActions({
  listing,
  onEdit,
  onCancel,
  cancelling,
}: {
  listing: ListingDoc;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <>
      <div
        style={{
          fontSize: "0.78rem",
          color: "#059669",
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
          padding: "0.5rem 0.65rem",
          borderRadius: 8,
          marginBottom: "0.75rem",
        }}
      >
        Your listing · {listing.remainingQuantity} of {listing.initialQuantity} left
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={onEdit} style={{ ...btnPrimary, flex: 1 }}>
          Edit price
        </button>
        <button
          onClick={onCancel}
          disabled={cancelling}
          style={{
            flex: 1,
            background: "var(--shell-card)",
            border: "1px solid var(--shell-border-strong)",
            color: "#b91c1c",
            padding: "0.65rem 1rem",
            borderRadius: 8,
            fontSize: "0.86rem",
            fontWeight: 600,
            cursor: cancelling ? "not-allowed" : "pointer",
          }}
        >
          {cancelling ? "Cancelling…" : "Cancel listing"}
        </button>
      </div>
    </>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--shell-border)",
        background: "var(--shell-card-alt)",
        borderRadius: 10,
        padding: "0.9rem",
        minWidth: 0,
      }}
    >
      <div style={{ color: "var(--shell-muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div style={{ color: "var(--shell-fg)", fontSize: "1.1rem", fontWeight: 760, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
      <div style={{ color: "var(--shell-faint)", fontSize: "0.74rem", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sub}
      </div>
    </div>
  );
}

function DossierTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--shell-border)",
        background: "var(--shell-card-alt)",
        borderRadius: 10,
        padding: "0.95rem 1rem",
      }}
    >
      <div style={{ color: "var(--shell-muted)", fontSize: "0.74rem", fontWeight: 650, marginBottom: "0.35rem" }}>{label}</div>
      <div style={{ color: "var(--shell-fg)", fontSize: "0.95rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function EditPriceModal({
  symbol,
  currentPrice,
  remainingQty,
  price,
  submitting,
  onChange,
  onSubmit,
  onClose,
}: {
  symbol: string;
  currentPrice: number;
  remainingQty: number;
  price: string;
  submitting: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const newPrice = Number(price);
  const valid = Number.isFinite(newPrice) && newPrice > 0;
  const changed = valid && Math.abs(newPrice - currentPrice) > 1e-9;

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
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: "94vw",
          background: "var(--shell-card)",
          borderRadius: 14,
          padding: "1.4rem 1.5rem",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.2rem" }}>
          Update listing price
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
          {remainingQty} {symbol} remaining at ${currentPrice.toFixed(2)} / token
        </div>

        <label style={{ fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>
          New price (USDC per {symbol})
        </label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={price}
          onChange={(e) => onChange(e.target.value)}
          style={input}
        />

        {valid && changed ? (
          <div style={{ fontSize: "0.82rem", color: "var(--shell-muted)", marginTop: "0.75rem" }}>
            New total asking: <strong style={{ color: "var(--shell-fg)" }}>${(newPrice * remainingQty).toFixed(2)} USDC</strong>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: "var(--shell-card)",
              border: "1px solid var(--shell-border-strong)",
              color: "var(--shell-fg)",
              padding: "0.6rem 1rem",
              borderRadius: 8,
              fontSize: "0.86rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!changed || submitting}
            style={{
              flex: 1,
              ...btnPrimary,
              opacity: !changed || submitting ? 0.6 : 1,
              cursor: !changed || submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Updating…" : "Update price"}
          </button>
        </div>
      </div>
    </div>
  );
}

const rowActBtn: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  color: "var(--shell-link)",
  padding: "0.3rem 0.65rem",
  borderRadius: 6,
  fontSize: "0.76rem",
  fontWeight: 600,
  cursor: "pointer",
};

function viewerHoldsTokens(
  balance: number,
  viewer: string | null,
  listings: ListingDoc[],
): boolean {
  if (balance <= 0 || !viewer) return false;
  // If viewer already has an active listing for this mint, hide the
  // "List these tokens" nudge — they'd just re-open the same PDA.
  const hasActive = listings.some(
    (l) => l.seller === viewer && l.status === "active",
  );
  return !hasActive;
}

function ListModal({
  symbol,
  maxQty,
  form,
  onChange,
  onSubmit,
  onClose,
}: {
  symbol: string;
  maxQty: number;
  form: ListForm;
  onChange: (f: ListForm) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const qtyNum = Number(form.qty);
  const priceNum = Number(form.price);
  const totalValid =
    Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= maxQty && priceNum > 0;
  const total = totalValid ? qtyNum * priceNum : 0;

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
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: "94vw",
          background: "var(--shell-card)",
          borderRadius: 14,
          padding: "1.4rem 1.5rem",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.2rem" }}>
          List {symbol} tokens
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
          Holdings move into an escrow vault on-chain until sold or cancelled.
        </div>

        <label style={{ fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>
          Quantity (max {maxQty})
        </label>
        <input
          type="number"
          min={1}
          max={maxQty}
          value={form.qty}
          onChange={(e) => onChange({ ...form, qty: e.target.value })}
          style={input}
        />

        <label style={{ fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, display: "block", marginTop: "0.75rem", marginBottom: "0.3rem" }}>
          Price per {symbol} (USDC)
        </label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          value={form.price}
          onChange={(e) => onChange({ ...form, price: e.target.value })}
          style={input}
        />

        {totalValid ? (
          <div style={{ fontSize: "0.82rem", color: "var(--shell-muted)", marginTop: "0.75rem" }}>
            Asking <strong style={{ color: "var(--shell-fg)" }}>${total.toFixed(2)} USDC</strong> for {qtyNum} {symbol}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: "var(--shell-card)",
              border: "1px solid var(--shell-border-strong)",
              color: "var(--shell-fg)",
              padding: "0.6rem 1rem",
              borderRadius: 8,
              fontSize: "0.86rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!totalValid || form.submitting}
            style={{
              flex: 1,
              ...btnPrimary,
              opacity: !totalValid || form.submitting ? 0.6 : 1,
              cursor: !totalValid || form.submitting ? "not-allowed" : "pointer",
            }}
          >
            {form.submitting ? "Listing…" : "List"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DealRow({ deal, viewer }: { deal: OtcDealRow; viewer: string | null }) {
  const statusMeta: Record<DealStatusKey, { label: string; color: string }> = {
    proposed: { label: "Proposed", color: "var(--shell-link)" },
    accepted: { label: "Accepted", color: "#047857" },
    cancelled: { label: "Cancelled", color: "var(--shell-muted)" },
    expired: { label: "Expired", color: "var(--shell-muted)" },
  };
  const s = statusMeta[deal.status];
  const isMine = viewer && (viewer === deal.seller || viewer === deal.buyer);
  const counterparty = viewer === deal.seller ? deal.buyer : deal.seller;
  return (
    <div
      style={{
        padding: "0.6rem 1rem",
        borderBottom: "1px solid var(--shell-divider)",
        fontSize: "0.82rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontWeight: 600, color: "var(--shell-fg)" }}>
          ${deal.totalPriceUsdc.toFixed(2)} × {deal.quantity}
        </span>
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: s.color,
          }}
        >
          {s.label}
        </span>
      </div>
      <div style={{ fontSize: "0.74rem", color: "var(--shell-faint)", marginTop: "0.2rem" }}>
        {isMine ? `with ${shorten(counterparty)}` : `${shorten(deal.seller)} → ${shorten(deal.buyer)}`}
        {" · "}
        {new Date(deal.createdAt * 1000).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </div>
  );
}

function CheckoutControls({
  symbol,
  qty,
  maxQty,
  price,
  feeBps,
  confirming,
  onQty,
  onSubmit,
}: {
  symbol: string;
  qty: string;
  maxQty: number;
  price: number;
  feeBps: number;
  confirming: boolean;
  onQty: (qty: string) => void;
  onSubmit: () => void;
}) {
  const qtyNum = Number(qty) || 0;
  const safeTotal = qtyNum * price;
  const valid = Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= maxQty;
  const safeFee = (safeTotal * feeBps) / 10_000;
  const sellerShare = safeTotal - safeFee;

  function step(delta: number) {
    const next = Math.max(1, Math.min(maxQty, (Number(qty) || 1) + delta));
    onQty(next.toString());
  }

  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 750 }}>
            Quantity
          </label>
          <span style={{ fontSize: "0.72rem", color: "var(--shell-muted)", fontWeight: 650 }}>
            Max {maxQty} {symbol}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "42px 1fr 42px",
            gap: "0.5rem",
          }}
        >
          <button type="button" onClick={() => step(-1)} style={qtyButtonStyle} aria-label="Decrease quantity">
            -
          </button>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={qty}
            onChange={(e) => onQty(e.target.value)}
            style={{
              ...input,
              textAlign: "center",
              fontSize: "1rem",
              fontWeight: 750,
              padding: "0.72rem 0.75rem",
            }}
          />
          <button type="button" onClick={() => step(1)} style={qtyButtonStyle} aria-label="Increase quantity">
            +
          </button>
        </div>
      </div>

      <div
        style={{
          background: "var(--shell-pill-bg)",
          border: "1px solid var(--shell-border)",
          borderRadius: 12,
          padding: "0.85rem 0.95rem",
          fontSize: "0.82rem",
          marginBottom: "0.9rem",
        }}
      >
        <Row k="Subtotal" v={`$${safeTotal.toFixed(2)}`} />
        <Row k={`Platform fee (${(feeBps / 100).toFixed(2)}%)`} v={`$${safeFee.toFixed(2)}`} />
        <Row k="Seller receives" v={`$${sellerShare.toFixed(2)}`} />
        <div style={{ height: 1, background: "var(--shell-border)", margin: "0.45rem 0" }} />
        <Row k="You pay" v={`$${safeTotal.toFixed(2)} USDC`} bold />
      </div>

      <div style={trustNoteStyle}>
        One wallet signature settles USDC and releases tokens from escrow atomically.
      </div>

      <button
        onClick={onSubmit}
        disabled={!valid || confirming}
        style={{
          ...btnPrimary,
          width: "100%",
          marginTop: "0.85rem",
          padding: "0.82rem 1rem",
          fontSize: "0.92rem",
          opacity: !valid || confirming ? 0.58 : 1,
          cursor: !valid || confirming ? "not-allowed" : "pointer",
        }}
      >
        {confirming ? "Confirming..." : `Buy for $${safeTotal.toFixed(2)}`}
      </button>
    </>
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
        color: "var(--shell-muted)",
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
        color: "var(--shell-fg)",
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
    revoked: { bg: "rgba(107,114,128,0.12)", fg: "var(--shell-muted)", dot: "var(--shell-muted)", label: "Revoked" },
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
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        marginBottom: "1rem",
      }}
    >
      <h3 style={{ fontSize: "0.82rem", color: "var(--shell-muted)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: "0.85rem" }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--shell-divider)", fontSize: "0.88rem" }}>
      <span style={{ color: "var(--shell-muted)" }}>{k}</span>
      <span style={{ color: "var(--shell-fg)", fontWeight: 500 }}>{v}</span>
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
        color: bold ? "var(--shell-fg)" : "var(--shell-muted)",
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

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

const panel: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border)",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "0 10px 34px rgba(15,23,42,0.05)",
};

const checkoutPanel: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "var(--brand-shadow)",
};

const panelHeader: React.CSSProperties = {
  padding: "0.85rem 1rem",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
  borderBottom: "1px solid var(--shell-border)",
  background: "var(--shell-card-alt)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  color: "var(--shell-fg)",
  padding: "0.55rem 0.75rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const qtyButtonStyle: React.CSSProperties = {
  border: "1px solid var(--shell-border-strong)",
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  borderRadius: 10,
  fontSize: "1.1rem",
  fontWeight: 800,
  cursor: "pointer",
};

const trustNoteStyle: React.CSSProperties = {
  background: "rgba(37,99,235,0.07)",
  border: "1px solid rgba(37,99,235,0.16)",
  color: "var(--shell-muted)",
  borderRadius: 12,
  padding: "0.72rem 0.82rem",
  fontSize: "0.78rem",
  lineHeight: 1.5,
};

const btnPrimary: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "none",
  padding: "0.65rem 1.25rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 750,
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
};

const code: React.CSSProperties = {
  background: "var(--shell-divider)",
  color: "var(--shell-link)",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.78rem",
  fontFamily: "'SF Mono', Menlo, monospace",
};
