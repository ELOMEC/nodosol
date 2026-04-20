"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  decodeListingStatus,
  listingPda,
  listingVaultPda,
  marketplaceProgram,
  ListingStatusKey,
} from "@/lib/marketplace";
import { mintProgram } from "@/lib/rwa";

type AssetRow = {
  address: string;
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

type ListingRow = {
  address: string;
  assetMint: string;
  assetName: string | null;
  assetSymbol: string | null;
  priceUsdc: number;
  initialQuantity: number;
  remainingQuantity: number;
  status: ListingStatusKey;
  createdAt: number;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rows: AssetRow[]; listings: ListingRow[] }
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

export function AssetsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [busyAsset, setBusyAsset] = useState<string | null>(null);
  const [listModal, setListModal] = useState<{
    row: AssetRow;
    price: string;
    qty: string;
    submitting: boolean;
  } | null>(null);
  const [editPrice, setEditPrice] = useState<{
    listing: ListingRow;
    price: string;
    submitting: boolean;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const accountApi = (program.account as Record<string, {
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
      // memcmp at offset 8 matches the issuer_owner Pubkey (first field after the 8-byte discriminator).
      const ownerFilter = [
        {
          memcmp: {
            offset: 8,
            bytes: publicKey.toBase58(),
          },
        },
      ];
      const items = await accountApi.all(ownerFilter);
      const rows: AssetRow[] = items.map(({ publicKey: addr, account }) => ({
        address: addr.toBase58(),
        mint: account.mint.toBase58(),
        assetId: account.assetId.toString(),
        category: decodeCategory(account.category),
        status: decodeStatus(account.status),
        quantity: account.quantity.toNumber(),
        burned: account.burnedAmount.toNumber(),
        deliveryRequired: account.deliveryRequired,
        name: account.name,
        symbol: account.symbol,
        metadataUri: account.metadataUri,
        createdAt: account.createdAt.toNumber(),
      }));
      rows.sort((a, b) => b.createdAt - a.createdAt);

      // Listings owned by this wallet — seller is first field in Listing too.
      const market = marketplaceProgram(provider);
      const listingApi = (market.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            seller: PublicKey;
            assetMint: PublicKey;
            pricePerToken: BN;
            initialQuantity: BN;
            remainingQuantity: BN;
            status: Record<string, unknown>;
            createdAt: BN;
          };
        }>>;
      }>).listing;
      const listingItems = await listingApi.all(ownerFilter);
      const metaByMint = new Map(rows.map((r) => [r.mint, r]));
      const listings: ListingRow[] = listingItems
        .map(({ publicKey: addr, account }) => {
          const mintStr = account.assetMint.toBase58();
          const meta = metaByMint.get(mintStr);
          return {
            address: addr.toBase58(),
            assetMint: mintStr,
            assetName: meta?.name ?? null,
            assetSymbol: meta?.symbol ?? null,
            priceUsdc: Number(account.pricePerToken.toString()) / USDC_UNIT,
            initialQuantity: account.initialQuantity.toNumber(),
            remainingQuantity: account.remainingQuantity.toNumber(),
            status: decodeListingStatus(account.status),
            createdAt: account.createdAt.toNumber(),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      setState({ kind: "ready", rows, listings });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Fetch failed";
      setState({ kind: "error", message });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) {
      void reload();
    } else {
      setState({ kind: "idle" });
    }
  }, [connected, publicKey, reload]);

  async function burnOne(row: AssetRow) {
    if (!publicKey) return;
    const amount = window.prompt(`Burn how many ${row.symbol}? (circulating: ${row.quantity - row.burned})`);
    if (!amount) return;
    const qty = Number(amount);
    if (!Number.isInteger(qty) || qty <= 0 || qty > row.quantity - row.burned) {
      window.alert("Invalid amount");
      return;
    }
    setBusyAsset(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const mint = new PublicKey(row.mint);
      const ata = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = await program.methods
        .burnTokens(new BN(qty))
        .accounts({
          issuerOwner: publicKey,
          asset: new PublicKey(row.address),
          mint,
          issuerTokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Burn failed");
    } finally {
      setBusyAsset(null);
    }
  }

  async function submitEditPrice() {
    if (!editPrice || !publicKey) return;
    const { listing, price } = editPrice;
    const priceNum = Number(price);
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
      const assetMint = new PublicKey(listing.assetMint);
      const [listingAddr] = listingPda(publicKey, assetMint);
      const priceBaseUnits = BigInt(Math.round(priceNum * USDC_UNIT));

      const ix = await program.methods
        .updateListingPrice(new BN(priceBaseUnits.toString()))
        .accounts({
          seller: publicKey,
          listing: listingAddr,
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setEditPrice(null);
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Price update failed");
      setEditPrice((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  async function cancelListing(listing: ListingRow) {
    if (!publicKey) return;
    if (!window.confirm(`Cancel listing of ${listing.assetName ?? listing.assetSymbol ?? "asset"}? Remaining ${listing.remainingQuantity} tokens will be returned to your wallet.`)) {
      return;
    }
    setBusyAsset(listing.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(listing.assetMint);
      const sellerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyAsset(null);
    }
  }

  async function submitListing() {
    if (!listModal || !publicKey) return;
    const { row, price, qty } = listModal;
    const priceNum = Number(price);
    const qtyNum = Number(qty);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      window.alert("Invalid price");
      return;
    }
    if (!Number.isInteger(qtyNum) || qtyNum <= 0 || qtyNum > row.quantity - row.burned) {
      window.alert("Invalid quantity");
      return;
    }
    setListModal({ ...listModal, submitting: true });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = marketplaceProgram(provider);
      const assetMint = new PublicKey(row.mint);
      const paymentMint = getUsdcMint();
      const sellerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const [listing] = listingPda(publicKey, assetMint);
      const [vault] = listingVaultPda(listing);
      // Price is entered in whole USDC; convert to base units (6 decimals).
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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setListModal(null);
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Listing failed");
      setListModal((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  }

  async function transitionStatus(row: AssetRow, next: "Active" | "Paused" | "Retired") {
    if (!publicKey) return;
    setBusyAsset(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const ix = await program.methods
        .updateAssetStatus({ [next.toLowerCase()]: {} } as never)
        .accounts({
          issuerOwner: publicKey,
          asset: new PublicKey(row.address),
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusyAsset(null);
    }
  }

  if (!connected) {
    return (
      <EmptyShell>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.3rem" }}>Connect wallet</h3>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", marginBottom: "1rem" }}>
            Connect a Solana wallet to view your tokenised assets.
          </p>
          <WalletMultiButton />
        </div>
      </EmptyShell>
    );
  }

  if (state.kind === "loading") {
    return <EmptyShell>Loading your assets from Solana…</EmptyShell>;
  }

  if (state.kind === "error") {
    return <EmptyShell>Failed to load: {state.message}</EmptyShell>;
  }

  const rows = state.kind === "ready" ? state.rows : [];
  const listings = state.kind === "ready" ? state.listings : [];
  const activeCount = rows.filter((r) => r.status === "Active").length;
  const retiredCount = rows.filter((r) => r.status === "Retired").length;
  const totalCirculating = rows.reduce((s, r) => s + (r.quantity - r.burned), 0);
  const totalBurned = rows.reduce((s, r) => s + r.burned, 0);
  const activeListings = listings.filter((l) => l.status === "active");

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            My assets
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Assets you have tokenised as an issuer. Issuer wallet:{" "}
            <span style={{ color: "#111827", fontWeight: 500 }}>{publicKey && shorten(publicKey.toBase58())}</span>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Tokenised assets" value={rows.length.toString()} sub={`${activeCount} active · ${retiredCount} retired`} />
        <StatCard label="Tokens in circulation" value={totalCirculating.toString()} sub={`${totalBurned} burned`} />
        <StatCard label="Distinct mints" value={new Set(rows.map((r) => r.mint)).size.toString()} sub="Fixed-supply Token-2022" />
        <StatCard label="Issuer status" value="Active" valueColor="#059669" sub="SRB · Commodity, Ticket" />
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1.2rem", borderBottom: "1px solid #eef0f3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Tokenised assets</h3>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.15rem" }}>
              Live from on-chain. {rows.length} total.
            </p>
          </div>
          <button
            onClick={() => void reload()}
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#374151",
              padding: "0.4rem 0.9rem",
              borderRadius: 6,
              fontSize: "0.82rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>
            <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
              No tokenised assets yet
            </div>
            <div style={{ fontSize: "0.88rem", marginBottom: "1.2rem" }}>
              Tokenise your first asset to see it here.
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
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "#fafbfc", color: "#6b7280", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
                <Th>Asset</Th>
                <Th>Category</Th>
                <Th>Supply</Th>
                <Th>Status</Th>
                <Th>Tokenised</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address} style={{ borderTop: "1px solid #f1f2f4", opacity: busyAsset === r.address ? 0.5 : 1 }}>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: CATEGORY_GRADIENT[r.category] ?? "#ccc" }} />
                      <div>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{r.name || "(unnamed)"}</div>
                        <div style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
                          {r.symbol} · {shorten(r.mint)}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span style={{ fontSize: "0.78rem", color: "#6b7280", background: "#f3f4f6", padding: "0.2rem 0.55rem", borderRadius: 4, fontWeight: 500 }}>
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{r.quantity - r.burned}</div>
                    {r.burned > 0 ? (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                        {r.burned} burned of {r.quantity}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>of {r.quantity} total</div>
                    )}
                  </Td>
                  <Td>
                    <StatusPill status={r.status} />
                  </Td>
                  <Td style={{ color: "#6b7280" }}>
                    {new Date(r.createdAt * 1000).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Td>
                  <Td align="right">
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      {r.status === "Active" && r.quantity - r.burned > 0 ? (
                        <button
                          style={{ ...actBtn, background: "#eef2ff", color: "#4338ca", borderColor: "#c7d2fe" }}
                          onClick={() => setListModal({ row: r, price: "", qty: "", submitting: false })}
                          disabled={busyAsset === r.address}
                        >
                          List
                        </button>
                      ) : null}
                      {r.status === "Active" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Paused")} disabled={busyAsset === r.address}>
                          Pause
                        </button>
                      ) : r.status === "Paused" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Active")} disabled={busyAsset === r.address}>
                          Resume
                        </button>
                      ) : null}
                      {r.status !== "Retired" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Retired")} disabled={busyAsset === r.address}>
                          Retire
                        </button>
                      ) : null}
                      <button style={actBtn} onClick={() => void burnOne(r)} disabled={busyAsset === r.address || r.quantity - r.burned === 0}>
                        Burn
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600 }}>My listings</h3>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.15rem" }}>
              Active marketplace listings where your asset is in escrow.
            </p>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            {activeListings.length} active · {listings.length - activeListings.length} closed
          </div>
        </div>

        {listings.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #eef0f3",
              borderRadius: 12,
              padding: "2rem 1.5rem",
              textAlign: "center",
              color: "#6b7280",
              fontSize: "0.88rem",
            }}
          >
            No listings yet. Use the <strong>List</strong> button on an asset above to create one.
          </div>
        ) : (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #eef0f3",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#fafbfc", color: "#6b7280", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <Th>Asset</Th>
                  <Th>Price</Th>
                  <Th>Progress</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.address} style={{ borderTop: "1px solid #f1f2f4", opacity: busyAsset === l.address ? 0.5 : 1 }}>
                    <Td>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{l.assetName ?? "(unnamed)"}</div>
                      <div style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
                        {l.assetSymbol ?? "—"} · {shorten(l.assetMint)}
                      </div>
                    </Td>
                    <Td>
                      <div style={{ fontWeight: 600 }}>${l.priceUsdc.toFixed(2)}</div>
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>per token</div>
                    </Td>
                    <Td>
                      <div style={{ fontWeight: 600 }}>
                        {l.initialQuantity - l.remainingQuantity}/{l.initialQuantity}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>sold</div>
                    </Td>
                    <Td>
                      <ListingStatusPill status={l.status} />
                    </Td>
                    <Td align="right">
                      {l.status === "active" ? (
                        <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
                          <button
                            style={actBtn}
                            onClick={() => setEditPrice({ listing: l, price: l.priceUsdc.toString(), submitting: false })}
                            disabled={busyAsset === l.address}
                          >
                            Edit price
                          </button>
                          <button style={actBtn} onClick={() => void cancelListing(l)} disabled={busyAsset === l.address}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {listModal ? (
        <ListModal
          row={listModal.row}
          price={listModal.price}
          qty={listModal.qty}
          submitting={listModal.submitting}
          onChange={(patch) => setListModal({ ...listModal, ...patch })}
          onCancel={() => setListModal(null)}
          onSubmit={() => void submitListing()}
        />
      ) : null}

      {editPrice ? (
        <EditPriceModal
          listing={editPrice.listing}
          price={editPrice.price}
          submitting={editPrice.submitting}
          onChange={(v) => setEditPrice({ ...editPrice, price: v })}
          onCancel={() => setEditPrice(null)}
          onSubmit={() => void submitEditPrice()}
        />
      ) : null}
    </>
  );
}

function ListingStatusPill({ status }: { status: ListingStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    soldOut: { bg: "rgba(79,70,229,0.12)", fg: "#4338ca", dot: "#6366f1", label: "Sold out" },
    cancelled: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Cancelled" },
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
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function EditPriceModal({
  listing,
  price,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  listing: ListingRow;
  price: string;
  submitting: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const priceNum = Number(price) || 0;
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
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>Edit listing price</h3>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          Update the price per token for <strong>{listing.assetName ?? listing.assetSymbol ?? "this listing"}</strong>.
          Remaining {listing.remainingQuantity} of {listing.initialQuantity} tokens are still in escrow.
        </p>

        <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.3rem" }}>
          New price per token (USDC)
        </label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            color: "#111827",
            padding: "0.6rem 0.8rem",
            fontSize: "0.9rem",
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.55rem" }}>
          Current price: ${listing.priceUsdc.toFixed(2)} · Remaining revenue at new price: ${(priceNum * listing.remainingQuantity).toFixed(2)} USDC
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
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
              cursor: submitting || priceNum <= 0 ? "not-allowed" : "pointer",
              opacity: submitting || priceNum <= 0 ? 0.6 : 1,
              boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
            }}
            onClick={onSubmit}
            disabled={submitting || priceNum <= 0}
          >
            {submitting ? "Updating…" : "Update price"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListModal({
  row,
  price,
  qty,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  row: AssetRow;
  price: string;
  qty: string;
  submitting: boolean;
  onChange: (patch: Partial<{ price: string; qty: string }>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const circulating = row.quantity - row.burned;
  const priceNum = Number(price) || 0;
  const qtyNum = Number(qty) || 0;
  const total = priceNum * qtyNum;
  const fee = total * 0.025;
  const sellerNet = total - fee;
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
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>List asset on marketplace</h3>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          Tokens will be escrowed in the listing vault until they sell or you cancel.
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
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{row.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              {row.symbol} · {circulating} available
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem", marginBottom: "1rem" }}>
          <div>
            <label style={modalLabel}>Price per token (USDC)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              style={modalInput}
              placeholder="50.00"
              value={price}
              onChange={(e) => onChange({ price: e.target.value })}
            />
          </div>
          <div>
            <label style={modalLabel}>Quantity to list</label>
            <input
              type="number"
              min={1}
              max={circulating}
              style={modalInput}
              placeholder={String(circulating)}
              value={qty}
              onChange={(e) => onChange({ qty: e.target.value })}
            />
          </div>
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
          <SummaryRow k="Total price" v={`$${total.toFixed(2)} USDC`} />
          <SummaryRow k="Platform fee (2.5%)" v={`$${fee.toFixed(2)} USDC`} />
          <SummaryRow k="You receive per sale" v={`$${sellerNet.toFixed(2)} USDC`} bold />
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
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
              boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
            }}
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Creating listing…" : "Create listing"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
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

const modalLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  color: "#374151",
  fontWeight: 500,
  marginBottom: "0.3rem",
};

const modalInput: React.CSSProperties = {
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

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function decodeStatus(raw: Record<string, unknown>): "Active" | "Paused" | "Retired" {
  if ("active" in raw) return "Active";
  if ("paused" in raw) return "Paused";
  if ("retired" in raw) return "Retired";
  return "Active";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          My assets
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Assets you have tokenised as an issuer.</p>
      </header>
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

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: valueColor ?? "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", padding: "0.8rem 1.2rem", fontWeight: 600 }}>{children}</th>;
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: "1rem 1.2rem", verticalAlign: "middle", textAlign: align ?? "left", ...style }}>{children}</td>;
}

function StatusPill({ status }: { status: "Active" | "Paused" | "Retired" }) {
  const map = {
    Active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981" },
    Paused: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b" },
    Retired: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280" },
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
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {status}
    </span>
  );
}

const actBtn: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  color: "#374151",
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  fontSize: "0.78rem",
  fontWeight: 500,
  cursor: "pointer",
};
