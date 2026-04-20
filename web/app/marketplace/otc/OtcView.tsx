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
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  DealStatusKey,
  dealPda,
  dealVaultPda,
  decodeDealStatus,
  fetchOtcConfig,
  hashMemo,
  otcProgram,
} from "@/lib/otc";
import { mintProgram } from "@/lib/rwa";

type DealRow = {
  address: string;
  seller: string;
  buyer: string;
  assetMint: string;
  paymentMint: string;
  dealId: string;
  quantity: number;
  totalPriceUsdc: number;
  totalPriceBaseUnits: bigint;
  status: DealStatusKey;
  expiresAt: number;
  createdAt: number;
  memoHash: string;
  assetName: string | null;
  assetSymbol: string | null;
  assetCategory: string | null;
};

type MyAssetOption = {
  mint: string;
  name: string;
  symbol: string;
  available: number;
  category: string;
};

type Tab = "as_seller" | "as_buyer";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      asSeller: DealRow[];
      asBuyer: DealRow[];
      myAssets: MyAssetOption[];
    }
  | { kind: "error"; message: string };

const EXPIRY_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "24 hours", seconds: 60 * 60 * 24 },
  { label: "7 days", seconds: 60 * 60 * 24 * 7 },
  { label: "30 days", seconds: 60 * 60 * 24 * 30 },
];

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

export function OtcView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [tab, setTab] = useState<Tab>("as_seller");
  const [proposeOpen, setProposeOpen] = useState(false);
  const [busyDeal, setBusyDeal] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState<number>(300);
  const [chatFor, setChatFor] = useState<DealRow | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const otc = otcProgram(provider);
      const rwa = mintProgram(provider);

      try {
        const cfg = await fetchOtcConfig(otc);
        setFeeBps(cfg.feeBps);
      } catch {
        // keep default
      }

      const dealAccountApi = (otc.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            seller: PublicKey;
            buyer: PublicKey;
            assetMint: PublicKey;
            paymentMint: PublicKey;
            dealId: BN;
            quantity: BN;
            totalPrice: BN;
            status: Record<string, unknown>;
            expiresAt: BN;
            createdAt: BN;
            memoHash: number[];
          };
        }>>;
      }>).deal;
      // seller at offset 8 (first field after discriminator).
      const asSellerRaw = await dealAccountApi.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      // buyer at offset 8 + 32 = 40.
      const asBuyerRaw = await dealAccountApi.all([
        { memcmp: { offset: 40, bytes: publicKey.toBase58() } },
      ]);

      // Fetch Asset metadata for joining.
      const assetAccountApi = (rwa.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
            mint: PublicKey;
            issuerOwner: PublicKey;
            category: Record<string, unknown>;
            status: Record<string, unknown>;
            quantity: BN;
            burnedAmount: BN;
            name: string;
            symbol: string;
          };
        }>>;
      }>).asset;
      const allAssets = await assetAccountApi.all();
      const byMint = new Map<string, (typeof allAssets)[number]["account"]>();
      for (const a of allAssets) byMint.set(a.account.mint.toBase58(), a.account);

      const enrich = (raw: typeof asSellerRaw): DealRow[] =>
        raw
          .map(({ publicKey: addr, account }) => {
            const mintStr = account.assetMint.toBase58();
            const meta = byMint.get(mintStr);
            const totalBase = BigInt(account.totalPrice.toString());
            return {
              address: addr.toBase58(),
              seller: account.seller.toBase58(),
              buyer: account.buyer.toBase58(),
              assetMint: mintStr,
              paymentMint: account.paymentMint.toBase58(),
              dealId: account.dealId.toString(),
              quantity: account.quantity.toNumber(),
              totalPriceUsdc: Number(totalBase) / USDC_UNIT,
              totalPriceBaseUnits: totalBase,
              status: decodeDealStatus(account.status),
              expiresAt: account.expiresAt.toNumber(),
              createdAt: account.createdAt.toNumber(),
              memoHash: Buffer.from(account.memoHash).toString("hex"),
              assetName: meta?.name ?? null,
              assetSymbol: meta?.symbol ?? null,
              assetCategory: meta ? decodeCategory(meta.category) : null,
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt);

      // My assets — tokenised BY this wallet, filter Active with circulating > 0.
      const myAssetAccounts = allAssets.filter(
        (a) => a.account.issuerOwner.toBase58() === publicKey.toBase58()
      );
      const myAssets: MyAssetOption[] = myAssetAccounts
        .map((a) => ({
          mint: a.account.mint.toBase58(),
          name: a.account.name,
          symbol: a.account.symbol,
          category: decodeCategory(a.account.category),
          available:
            a.account.quantity.toNumber() - a.account.burnedAmount.toNumber(),
        }))
        .filter((m) => m.available > 0);

      setState({
        kind: "ready",
        asSeller: enrich(asSellerRaw),
        asBuyer: enrich(asBuyerRaw),
        myAssets,
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Fetch failed";
      setState({ kind: "error", message });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  async function proposeDeal(form: {
    buyerPubkey: string;
    assetMint: string;
    quantity: number;
    totalPriceUsdc: number;
    expirySeconds: number;
    memo: string;
  }) {
    if (!publicKey) return;
    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = otcProgram(provider);
    let buyer: PublicKey;
    try {
      buyer = new PublicKey(form.buyerPubkey);
    } catch {
      throw new Error("Invalid buyer pubkey");
    }
    if (buyer.equals(publicKey)) {
      throw new Error("Seller and buyer must be different wallets");
    }
    const assetMint = new PublicKey(form.assetMint);
    const paymentMint = getUsdcMint();
    const dealIdBig = BigInt(Math.floor(Date.now() / 1000));
    const [deal] = dealPda(publicKey, buyer, dealIdBig);
    const [vault] = dealVaultPda(deal);
    const sellerAssetAta = getAssociatedTokenAddressSync(
      assetMint,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + form.expirySeconds;
    const memoHash = await hashMemo(form.memo);
    const totalBase = BigInt(Math.round(form.totalPriceUsdc * USDC_UNIT));

    const ix = await program.methods
      .proposeDeal(
        new BN(dealIdBig.toString()),
        new BN(form.quantity),
        new BN(totalBase.toString()),
        new BN(expiresAt),
        memoHash
      )
      .accounts({
        seller: publicKey,
        buyer,
        assetMint,
        paymentMint,
        deal,
        vault,
        sellerAssetAccount: sellerAssetAta,
        assetTokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ix);
    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    await reload();
  }

  async function acceptDeal(row: DealRow) {
    if (!publicKey) return;
    setBusyDeal(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = otcProgram(provider);
      const assetMint = new PublicKey(row.assetMint);
      const paymentMint = new PublicKey(row.paymentMint);
      const seller = new PublicKey(row.seller);
      const [deal] = dealPda(seller, publicKey, BigInt(row.dealId));
      const [vault] = dealVaultPda(deal);
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
      const cfg = await fetchOtcConfig(program);

      const ix = await program.methods
        .acceptDeal()
        .accounts({
          buyer: publicKey,
          assetMint,
          paymentMint,
          deal,
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
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusyDeal(null);
    }
  }

  async function cancelDeal(row: DealRow) {
    if (!publicKey) return;
    if (!window.confirm(`Cancel OTC deal with ${shorten(row.buyer)}? ${row.quantity} tokens return to your wallet.`)) return;
    setBusyDeal(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = otcProgram(provider);
      const assetMint = new PublicKey(row.assetMint);
      const buyer = new PublicKey(row.buyer);
      const [deal] = dealPda(publicKey, buyer, BigInt(row.dealId));
      const [vault] = dealVaultPda(deal);
      const sellerAssetAta = getAssociatedTokenAddressSync(
        assetMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = await program.methods
        .cancelDeal()
        .accounts({
          seller: publicKey,
          assetMint,
          deal,
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
      setBusyDeal(null);
    }
  }

  const asSeller = state.kind === "ready" ? state.asSeller : [];
  const asBuyer = state.kind === "ready" ? state.asBuyer : [];
  const myAssets = state.kind === "ready" ? state.myAssets : [];
  const visible = tab === "as_seller" ? asSeller : asBuyer;
  const proposedAsSeller = asSeller.filter((d) => d.status === "proposed").length;
  const proposedAsBuyer = asBuyer.filter((d) => d.status === "proposed").length;

  if (!connected) {
    return (
      <EmptyShell>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.3rem" }}>Connect wallet</h3>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", marginBottom: "1rem" }}>
            Connect a Solana wallet to propose or accept OTC deals.
          </p>
          <WalletMultiButton />
        </div>
      </EmptyShell>
    );
  }

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            OTC deals
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Peer-to-peer negotiated trades with dual-party escrow. Set a specific counterparty, price, and expiry; accept is atomic.
          </p>
        </div>
        <button
          onClick={() => setProposeOpen(true)}
          disabled={myAssets.length === 0}
          title={myAssets.length === 0 ? "Tokenise an asset first" : undefined}
          style={{
            background: myAssets.length === 0 ? "#e5e7eb" : "#4f46e5",
            color: myAssets.length === 0 ? "#9ca3af" : "#fff",
            padding: "0.6rem 1.15rem",
            borderRadius: 8,
            fontSize: "0.88rem",
            fontWeight: 600,
            border: "none",
            cursor: myAssets.length === 0 ? "not-allowed" : "pointer",
            boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
          }}
        >
          + Propose OTC deal
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="As seller" value={asSeller.length.toString()} sub={`${proposedAsSeller} pending`} />
        <StatCard label="As buyer" value={asBuyer.length.toString()} sub={`${proposedAsBuyer} awaiting your accept`} />
        <StatCard label="Platform fee" value={`${(feeBps / 100).toFixed(2)}%`} sub="On accepted deals" />
        <StatCard label="Expiry window" value="1 min – 30 days" sub="Enforced on-chain" />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <TabButton active={tab === "as_seller"} onClick={() => setTab("as_seller")}>
          As seller ({asSeller.length})
        </TabButton>
        <TabButton active={tab === "as_buyer"} onClick={() => setTab("as_buyer")}>
          As buyer ({asBuyer.length})
        </TabButton>
      </div>

      {state.kind === "loading" ? (
        <CenteredCard>Loading deals from Solana…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed to load: {state.message}</CenteredCard>
      ) : visible.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            No deals as {tab === "as_seller" ? "seller" : "buyer"}
          </div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280" }}>
            {tab === "as_seller"
              ? "Propose a deal to a specific counterparty to get started."
              : "You will see OTC deals here when someone proposes one to your wallet."}
          </div>
        </CenteredCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {visible.map((d) => (
            <DealCard
              key={d.address}
              deal={d}
              viewerIsSeller={tab === "as_seller"}
              onAccept={() => void acceptDeal(d)}
              onCancel={() => void cancelDeal(d)}
              onChat={() => setChatFor(d)}
              busy={busyDeal === d.address}
            />
          ))}
        </div>
      )}

      {proposeOpen ? (
        <ProposeModal
          myAssets={myAssets}
          feeBps={feeBps}
          onClose={() => setProposeOpen(false)}
          onSubmit={async (form) => {
            await proposeDeal(form);
            setProposeOpen(false);
          }}
        />
      ) : null}

      {chatFor && publicKey ? (
        <ChatPanel
          memoHash={chatFor.memoHash}
          sellerPubkey={chatFor.seller}
          buyerPubkey={chatFor.buyer}
          dealAddress={chatFor.address}
          viewerPubkey={publicKey.toBase58()}
          onClose={() => setChatFor(null)}
        />
      ) : null}
    </>
  );
}

function ProposeModal({
  myAssets,
  feeBps,
  onClose,
  onSubmit,
}: {
  myAssets: MyAssetOption[];
  feeBps: number;
  onClose: () => void;
  onSubmit: (form: {
    buyerPubkey: string;
    assetMint: string;
    quantity: number;
    totalPriceUsdc: number;
    expirySeconds: number;
    memo: string;
  }) => Promise<void>;
}) {
  const [buyerPubkey, setBuyer] = useState("");
  const [assetMint, setAssetMint] = useState(myAssets[0]?.mint ?? "");
  const [quantity, setQty] = useState("");
  const [totalPrice, setPrice] = useState("");
  const [expirySeconds, setExpiry] = useState(EXPIRY_PRESETS[1].seconds);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedAsset = useMemo(
    () => myAssets.find((a) => a.mint === assetMint),
    [myAssets, assetMint]
  );

  const qtyNum = Number(quantity);
  const priceNum = Number(totalPrice);
  const canSubmit =
    !submitting &&
    buyerPubkey.trim().length >= 32 &&
    assetMint &&
    Number.isInteger(qtyNum) &&
    qtyNum > 0 &&
    selectedAsset &&
    qtyNum <= selectedAsset.available &&
    Number.isFinite(priceNum) &&
    priceNum > 0;

  const fee = (priceNum * feeBps) / 10_000;
  const sellerShare = priceNum - fee;

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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
          width: 560,
          maxWidth: "92vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.35rem" }}>Propose OTC deal</h3>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          Escrow your tokens and lock in terms for a specific counterparty. The deal auto-expires if not accepted in time.
        </p>

        <div style={{ marginBottom: "1rem" }}>
          <Label>Counterparty wallet (buyer)</Label>
          <input
            style={input}
            placeholder="Solana wallet address"
            value={buyerPubkey}
            onChange={(e) => setBuyer(e.target.value.trim())}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Label>Asset</Label>
          <select style={input} value={assetMint} onChange={(e) => setAssetMint(e.target.value)}>
            {myAssets.map((a) => (
              <option key={a.mint} value={a.mint}>
                {a.name} ({a.symbol}) — {a.available} available · {CATEGORY_LABEL[a.category] ?? a.category}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem", marginBottom: "1rem" }}>
          <div>
            <Label>Quantity</Label>
            <input
              type="number"
              min={1}
              max={selectedAsset?.available}
              style={input}
              value={quantity}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Total price (USDC)</Label>
            <input
              type="number"
              min={0}
              step="0.01"
              style={input}
              value={totalPrice}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Label>Expires in</Label>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.seconds}
                type="button"
                onClick={() => setExpiry(p.seconds)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: expirySeconds === p.seconds ? "#4f46e5" : "#e5e7eb",
                  background: expirySeconds === p.seconds ? "#eef2ff" : "#ffffff",
                  color: expirySeconds === p.seconds ? "#4338ca" : "#374151",
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <Label>Memo (off-chain note, only its SHA-256 hash is stored on-chain)</Label>
          <textarea
            style={{ ...input, minHeight: 80, resize: "vertical" }}
            placeholder="Delivery Belgrade warehouse, KYC packet #42, payment due upon inspection…"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
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
          <Row k="Total price" v={priceNum > 0 ? `$${priceNum.toFixed(2)} USDC` : "—"} />
          <Row k={`Platform fee (${(feeBps / 100).toFixed(2)}%)`} v={priceNum > 0 ? `$${fee.toFixed(2)} USDC` : "—"} />
          <Row k="You receive on accept" v={priceNum > 0 ? `$${sellerShare.toFixed(2)} USDC` : "—"} bold />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button style={btnSecondary} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? "pointer" : "not-allowed" }}
            disabled={!canSubmit}
            onClick={async () => {
              if (!canSubmit) return;
              setSubmitting(true);
              try {
                await onSubmit({
                  buyerPubkey,
                  assetMint,
                  quantity: qtyNum,
                  totalPriceUsdc: priceNum,
                  expirySeconds,
                  memo,
                });
              } catch (err) {
                window.alert(err instanceof Error ? err.message : "Propose failed");
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Escrowing…" : "Propose deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DealCard({
  deal,
  viewerIsSeller,
  onAccept,
  onCancel,
  onChat,
  busy,
}: {
  deal: DealRow;
  viewerIsSeller: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onChat: () => void;
  busy: boolean;
}) {
  const gradient = CATEGORY_GRADIENT[deal.assetCategory ?? "other"] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[deal.assetCategory ?? "other"] ?? "RWA";
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = deal.expiresAt - now;
  const timeLeft =
    secondsLeft <= 0
      ? "Expired"
      : secondsLeft > 86400
        ? `${Math.floor(secondsLeft / 86400)}d ${Math.floor((secondsLeft % 86400) / 3600)}h left`
        : secondsLeft > 3600
          ? `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m left`
          : `${Math.floor(secondsLeft / 60)}m left`;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        display: "grid",
        gridTemplateColumns: "56px 1fr auto",
        gap: "1rem",
        alignItems: "center",
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div style={{ width: 56, height: 56, borderRadius: 10, background: gradient }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <div style={{ fontSize: "0.98rem", fontWeight: 600 }}>{deal.assetName ?? "(unnamed)"}</div>
          <span style={{ fontSize: "0.72rem", color: "#6b7280", background: "#f3f4f6", padding: "0.16rem 0.5rem", borderRadius: 4, fontWeight: 500 }}>
            {categoryLabel}
          </span>
          <DealStatusPill status={deal.status} />
        </div>
        <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem" }}>
          {viewerIsSeller ? (
            <>To: <code style={code}>{shorten(deal.buyer)}</code></>
          ) : (
            <>From: <code style={code}>{shorten(deal.seller)}</code></>
          )}{" "}
          · {deal.quantity} {deal.assetSymbol ?? ""} for ${deal.totalPriceUsdc.toFixed(2)} USDC
        </div>
        <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>
          {deal.status === "proposed" ? timeLeft : `Ended ${new Date(deal.expiresAt * 1000).toLocaleDateString()}`}
          {" · "}memo <code style={code}>{deal.memoHash.slice(0, 8)}…</code>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button style={{ ...btnSecondary, padding: "0.5rem 0.85rem" }} onClick={onChat}>
          Chat
        </button>
        {deal.status === "proposed" ? (
          viewerIsSeller ? (
            <button style={{ ...btnSecondary, padding: "0.5rem 0.95rem" }} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          ) : (
            <button style={{ ...btnPrimary, padding: "0.5rem 1.05rem" }} onClick={onAccept} disabled={busy || secondsLeft <= 0}>
              {busy ? "…" : "Accept"}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

function DealStatusPill({ status }: { status: DealStatusKey }) {
  const map = {
    proposed: { bg: "rgba(79,70,229,0.12)", fg: "#4338ca", dot: "#6366f1", label: "Proposed" },
    accepted: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Accepted" },
    cancelled: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Cancelled" },
    expired: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Expired" },
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

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: 8,
        border: "none",
        background: active ? "#eef2ff" : "#ffffff",
        color: active ? "#4338ca" : "#6b7280",
        fontSize: "0.86rem",
        fontWeight: 600,
        cursor: "pointer",
        borderBottom: active ? "2px solid #4f46e5" : "2px solid transparent",
      }}
    >
      {children}
    </button>
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

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>OTC deals</h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Peer-to-peer negotiated trades with escrow.</p>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.3rem" }}>
      {children}
    </label>
  );
}

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const input: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#111827",
  padding: "0.6rem 0.8rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.6rem 1.3rem",
  borderRadius: 8,
  fontSize: "0.86rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
};

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.6rem 1.15rem",
  borderRadius: 8,
  fontSize: "0.86rem",
  fontWeight: 600,
  cursor: "pointer",
};

const code: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#4338ca",
  padding: "0.05rem 0.35rem",
  borderRadius: 4,
  fontFamily: "'SF Mono', Menlo, monospace",
  fontSize: "0.78rem",
};
