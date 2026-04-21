"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  ACCOUNT_COMPRESSION_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  decodeEventStatus,
  EventStatusKey,
  eventTicketsProgram,
  fetchEventTicketsConfig,
  NOOP_PROGRAM_ID,
  treeConfigPda,
} from "@/lib/eventTickets";

type EventData = {
  address: string;
  creator: string;
  eventId: string;
  paymentMint: string;
  vault: string;
  merkleTree: string;
  price: number;
  capacity: number;
  sold: number;
  startsAt: number;
  endsAt: number;
  totalRevenue: number;
  totalWithdrawn: number;
  treeInitialised: boolean;
  status: EventStatusKey;
  name: string;
  symbol: string;
  metadataUri: string;
  imageUrl: string | null;
  description: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; event: EventData }
  | { kind: "error"; message: string };

export function EventDetailView({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState("1");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const walletAdapter = publicKey
        ? (wallet as unknown as Wallet)
        : ({
            publicKey: PublicKey.default,
            signTransaction: async (tx: Transaction) => tx,
            signAllTransactions: async (txs: Transaction[]) => txs,
          } as unknown as Wallet);
      const provider = new AnchorProvider(connection, walletAdapter, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);
      const eventPk = new PublicKey(address);
      const raw = (await (program.account as Record<string, {
        fetch: (pk: PublicKey) => Promise<{
          creator: PublicKey;
          eventId: BN;
          paymentMint: PublicKey;
          vault: PublicKey;
          merkleTree: PublicKey;
          price: BN;
          capacity: BN;
          sold: BN;
          startsAt: BN;
          endsAt: BN;
          totalRevenue: BN;
          totalWithdrawn: BN;
          treeInitialised: boolean;
          status: Record<string, unknown>;
          name: string;
          symbol: string;
          metadataUri: string;
        }>;
      }>).event.fetch(eventPk));

      let imageUrl: string | null = null;
      let description: string | null = null;
      if (raw.metadataUri) {
        try {
          const httpUri = raw.metadataUri.startsWith("ipfs://")
            ? raw.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
            : raw.metadataUri;
          const resp = await fetch(httpUri, { cache: "force-cache" });
          if (resp.ok) {
            const json = (await resp.json()) as { image?: string; description?: string };
            if (json.image) imageUrl = json.image;
            if (json.description) description = json.description;
          }
        } catch {
          // ignore
        }
      }

      setState({
        kind: "ready",
        event: {
          address,
          creator: raw.creator.toBase58(),
          eventId: raw.eventId.toString(),
          paymentMint: raw.paymentMint.toBase58(),
          vault: raw.vault.toBase58(),
          merkleTree: raw.merkleTree.toBase58(),
          price: Number(raw.price.toString()) / USDC_UNIT,
          capacity: raw.capacity.toNumber(),
          sold: raw.sold.toNumber(),
          startsAt: raw.startsAt.toNumber(),
          endsAt: raw.endsAt.toNumber(),
          totalRevenue: Number(raw.totalRevenue.toString()) / USDC_UNIT,
          totalWithdrawn: Number(raw.totalWithdrawn.toString()) / USDC_UNIT,
          treeInitialised: raw.treeInitialised,
          status: decodeEventStatus(raw.status),
          name: raw.name,
          symbol: raw.symbol,
          metadataUri: raw.metadataUri,
          imageUrl,
          description,
        },
      });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [address, connection, publicKey, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(ev: EventData) {
    if (!publicKey) return;
    setBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);
      const cfg = await fetchEventTicketsConfig(program);
      const paymentMint = new PublicKey(ev.paymentMint);
      const buyerAta = getAssociatedTokenAddressSync(
        paymentMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const merkleTree = new PublicKey(ev.merkleTree);
      const [tc] = treeConfigPda(merkleTree);
      const ix = await program.methods
        .buyTicket()
        .accounts({
          buyer: publicKey,
          event: new PublicKey(ev.address),
          vault: new PublicKey(ev.vault),
          paymentMint,
          buyerPaymentAccount: buyerAta,
          config: cfg.address,
          treasury: cfg.treasury,
          paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
          treeConfig: tc,
          leafOwner: publicKey,
          leafDelegate: publicKey,
          merkleTree,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          logWrapper: NOOP_PROGRAM_ID,
          compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      window.alert(`Ticket minted as cNFT to your wallet.\nTx: ${sig}`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") return <Centered>Loading event…</Centered>;
  if (state.kind === "error")
    return (
      <Centered>
        <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Could not load event</div>
        <div style={{ fontSize: "0.85rem", color: "var(--shell-muted, #6b7280)" }}>{state.message}</div>
        <Link href="/marketplace/events" style={{ display: "inline-block", marginTop: "1rem" }}>
          ← Back to events
        </Link>
      </Centered>
    );

  const ev = state.event;
  const left = ev.capacity - ev.sold;
  const qtyNum = Math.max(1, Math.min(left, Number(qty) || 1));
  const total = ev.price * qtyNum;
  const isOwn = publicKey?.toBase58() === ev.creator;
  const endsDate = new Date(ev.endsAt * 1000);

  return (
    <>
      <Link
        href="/marketplace/events"
        style={{ fontSize: "0.85rem", color: "var(--shell-muted, #6b7280)", display: "inline-block", marginBottom: "0.85rem" }}
      >
        ← All events
      </Link>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: "1.75rem",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            background: "var(--shell-card, #fff)",
            border: "1px solid var(--shell-border, #eef0f3)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: ev.imageUrl
                ? `center / cover no-repeat url(${ev.imageUrl})`
                : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
              height: 320,
            }}
          />
          <div style={{ padding: "1.5rem 1.75rem" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 600, letterSpacing: "-0.01em", marginBottom: "0.4rem" }}>
              {ev.name || "(unnamed event)"}
            </h1>
            <div style={{ fontSize: "0.85rem", color: "var(--shell-muted, #6b7280)", marginBottom: "1rem" }}>
              {ev.symbol} · by {shorten(ev.creator)}
            </div>
            {ev.description ? (
              <p style={{ fontSize: "0.95rem", lineHeight: 1.55, color: "var(--shell-fg, #111827)" }}>
                {ev.description}
              </p>
            ) : null}

            <div style={{ marginTop: "1.25rem", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
              <Info label="Status">{capital(ev.status)}</Info>
              <Info label="Tree initialised">{ev.treeInitialised ? "Yes" : "No"}</Info>
              <Info label="Sale ends">
                {endsDate.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </Info>
              <Info label="Event id">#{ev.eventId}</Info>
            </div>
          </div>
        </div>

        <aside>
          <div
            style={{
              background: "var(--shell-card, #fff)",
              border: "1px solid var(--shell-border, #eef0f3)",
              borderRadius: 14,
              padding: "1.3rem 1.4rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "1.85rem", fontWeight: 700 }}>${ev.price.toFixed(2)}</span>
              <span style={{ fontSize: "0.82rem", color: "var(--shell-muted, #6b7280)" }}>USDC · per ticket</span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--shell-muted, #6b7280)", marginBottom: "1rem" }}>
              <strong style={{ color: "#4338ca" }}>{left}</strong> of {ev.capacity} available
            </div>

            {!connected ? (
              <WalletMultiButton />
            ) : isOwn ? (
              <div
                style={{
                  padding: "0.7rem 1rem",
                  background: "var(--shell-pill-bg, #f7f8fa)",
                  color: "var(--shell-muted, #6b7280)",
                  textAlign: "center",
                  borderRadius: 8,
                  fontSize: "0.86rem",
                }}
              >
                You created this event
              </div>
            ) : !ev.treeInitialised ? (
              <div
                style={{
                  padding: "0.7rem 1rem",
                  background: "rgba(245,158,11,0.12)",
                  color: "#b45309",
                  textAlign: "center",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                Ticket tree not yet initialised
              </div>
            ) : left <= 0 ? (
              <div
                style={{
                  padding: "0.7rem 1rem",
                  background: "var(--shell-pill-bg, #f7f8fa)",
                  color: "var(--shell-muted, #6b7280)",
                  textAlign: "center",
                  borderRadius: 8,
                  fontSize: "0.86rem",
                }}
              >
                Sold out
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="number"
                    min={1}
                    max={left}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    style={{
                      width: 70,
                      background: "var(--shell-input-bg, #fff)",
                      border: "1px solid var(--shell-border-strong, #e5e7eb)",
                      borderRadius: 8,
                      color: "var(--shell-fg, #111827)",
                      padding: "0.55rem 0.6rem",
                      fontSize: "0.9rem",
                      outline: "none",
                      textAlign: "center",
                    }}
                  />
                  <button
                    onClick={() => void buy(ev)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      background: "#4f46e5",
                      color: "#fff",
                      border: "none",
                      padding: "0.6rem 1rem",
                      borderRadius: 8,
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.55 : 1,
                    }}
                  >
                    {busy ? "Minting…" : `Buy ${qtyNum} — $${total.toFixed(2)}`}
                  </button>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--shell-muted, #6b7280)" }}>
                  One transaction mints {qtyNum > 1 ? "requires repeat clicks" : "the cNFT"} directly to your wallet.
                </div>
              </>
            )}

            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--shell-divider, #f3f4f6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--shell-muted, #6b7280)" }}>
                <span>Lifetime revenue</span>
                <span>${ev.totalRevenue.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--shell-muted, #6b7280)" }}>
                <span>Withdrawn</span>
                <span>${ev.totalWithdrawn.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.85rem 1rem",
              background: "var(--shell-pill-bg, #f7f8fa)",
              border: "1px solid var(--shell-border, #eef0f3)",
              borderRadius: 10,
              fontSize: "0.75rem",
              color: "var(--shell-muted, #6b7280)",
              lineHeight: 1.5,
            }}
          >
            Tickets are compressed NFTs minted via Metaplex Bubblegum. They appear under Phantom &gt; Collectibles after the buy confirms.
          </div>
        </aside>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-pill-bg, #f7f8fa)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 8,
        padding: "0.55rem 0.75rem",
      }}
    >
      <div style={{ fontSize: "0.7rem", color: "var(--shell-muted, #6b7280)", marginBottom: "0.15rem" }}>{label}</div>
      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--shell-fg, #111827)" }}>{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "var(--shell-muted, #6b7280)",
      }}
    >
      {children}
    </div>
  );
}

function shorten(s: string) {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
