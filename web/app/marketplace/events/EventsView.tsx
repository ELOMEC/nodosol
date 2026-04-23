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
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  ACCOUNT_COMPRESSION_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  buildCreateMerkleTreeAccountIx,
  decodeEventStatus,
  EventStatusKey,
  eventPda,
  eventTicketsProgram,
  eventVaultPda,
  fetchEventTicketsConfig,
  MERKLE_TREE_ACCOUNT_SIZE,
  NOOP_PROGRAM_ID,
  treeConfigPda,
} from "@/lib/eventTickets";
import { simulateAndSend } from "@/lib/tx";
import { explainSolanaError } from "@/lib/solanaErrors";
import { useToast } from "@/components/ToastProvider";

type EventRow = {
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
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; mine: EventRow[]; public: EventRow[] }
  | { kind: "error"; message: string };

type Tab = "browse" | "mine";

export function EventsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [tab, setTab] = useState<Tab>("browse");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState(250);
  const [buyQty, setBuyQty] = useState("1");
  const toast = useToast();

  const reload = useCallback(async () => {
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

      try {
        const cfg = await fetchEventTicketsConfig(program);
        setFeeBps(cfg.feeBps);
      } catch {
        // program might not be deployed yet — keep default
      }

      const api = (program.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
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
          };
        }>>;
      }>).event;

      let items: Awaited<ReturnType<typeof api.all>> = [];
      try {
        items = await api.all();
      } catch (err) {
        console.warn("event_tickets program not deployed yet?", err);
        setState({ kind: "ready", mine: [], public: [] });
        return;
      }

      const uniqueUris = Array.from(
        new Set(
          items
            .map((x) => x.account.metadataUri)
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

      const rows: EventRow[] = items.map(({ publicKey: addr, account }) => ({
        address: addr.toBase58(),
        creator: account.creator.toBase58(),
        eventId: account.eventId.toString(),
        paymentMint: account.paymentMint.toBase58(),
        vault: account.vault.toBase58(),
        merkleTree: account.merkleTree.toBase58(),
        price: Number(account.price.toString()) / USDC_UNIT,
        capacity: account.capacity.toNumber(),
        sold: account.sold.toNumber(),
        startsAt: account.startsAt.toNumber(),
        endsAt: account.endsAt.toNumber(),
        totalRevenue: Number(account.totalRevenue.toString()) / USDC_UNIT,
        totalWithdrawn: Number(account.totalWithdrawn.toString()) / USDC_UNIT,
        treeInitialised: account.treeInitialised,
        status: decodeEventStatus(account.status),
        name: account.name,
        symbol: account.symbol,
        metadataUri: account.metadataUri,
        imageUrl: account.metadataUri ? imageByUri.get(account.metadataUri) ?? null : null,
      }));

      const mine = publicKey
        ? rows.filter((r) => r.creator === publicKey.toBase58())
        : [];
      const pub = rows.filter(
        (r) => r.status === "active" && r.treeInitialised && r.sold < r.capacity
      );

      setState({ kind: "ready", mine, public: pub });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createEvent(form: {
    name: string;
    symbol: string;
    price: number;
    capacity: number;
    durationHours: number;
    metadataUri: string;
  }) {
    if (!publicKey) return;
    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = eventTicketsProgram(provider);

    const eventId = BigInt(Math.floor(Date.now() / 1000));
    const [event] = eventPda(publicKey, eventId);
    const [vault] = eventVaultPda(event);
    const startsAt = Math.floor(Date.now() / 1000);
    const endsAt = startsAt + form.durationHours * 3600;
    const priceBaseUnits = BigInt(Math.round(form.price * USDC_UNIT));

    const ix = await program.methods
      .createEvent(
        new BN(eventId.toString()),
        new BN(priceBaseUnits.toString()),
        new BN(form.capacity),
        new BN(startsAt),
        new BN(endsAt),
        form.name,
        form.symbol,
        form.metadataUri
      )
      .accounts({
        creator: publicKey,
        paymentMint: getUsdcMint(),
        event,
        vault,
        paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const sig = await simulateAndSend(connection, wallet, {
      feePayer: publicKey,
      instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ix,
    ],
    });
    await reload();
  }

  async function initializeTree(row: EventRow) {
    if (!publicKey) return;
    setBusyEvent(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);

      const merkleTreeKp = Keypair.generate();
      const rent = await connection.getMinimumBalanceForRentExemption(MERKLE_TREE_ACCOUNT_SIZE);

      const createAccIx = buildCreateMerkleTreeAccountIx(
        publicKey,
        merkleTreeKp.publicKey,
        rent
      );
      const [tc] = treeConfigPda(merkleTreeKp.publicKey);
      const initIx = await program.methods
        .initializeEventTree()
        .accounts({
          creator: publicKey,
          event: new PublicKey(row.address),
          treeConfig: tc,
          merkleTree: merkleTreeKp.publicKey,
          bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
          compressionProgram: ACCOUNT_COMPRESSION_PROGRAM_ID,
          logWrapper: NOOP_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
          createAccIx,
          initIx,
        ],
        signers: [merkleTreeKp],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyEvent(null);
    }
  }

  async function buyTicket(row: EventRow) {
    if (!publicKey) return;
    setBusyEvent(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);
      const cfg = await fetchEventTicketsConfig(program);

      const paymentMint = new PublicKey(row.paymentMint);
      const buyerPaymentAta = getAssociatedTokenAddressSync(
        paymentMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const merkleTree = new PublicKey(row.merkleTree);
      const [tc] = treeConfigPda(merkleTree);
      const ix = await program.methods
        .buyTicket()
        .accounts({
          buyer: publicKey,
          event: new PublicKey(row.address),
          vault: new PublicKey(row.vault),
          paymentMint,
          buyerPaymentAccount: buyerPaymentAta,
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

      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ix,
      ],
      });
      console.log("Buy ticket tx:", sig);
      toast.success("Ticket minted");
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyEvent(null);
    }
  }

  async function withdrawRevenue(row: EventRow) {
    if (!publicKey) return;
    const amountStr = window.prompt(
      `Withdraw how much USDC? Available: $${(row.totalRevenue - row.totalWithdrawn).toFixed(2)}`
    );
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const baseUnits = BigInt(Math.round(amount * USDC_UNIT));
    setBusyEvent(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);
      const paymentMint = new PublicKey(row.paymentMint);
      const destAta = getAssociatedTokenAddressSync(
        paymentMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = await program.methods
        .withdrawEventRevenue(new BN(baseUnits.toString()))
        .accounts({
          creator: publicKey,
          event: new PublicKey(row.address),
          paymentMint,
          vault: new PublicKey(row.vault),
          destination: destAta,
          paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyEvent(null);
    }
  }

  async function transitionStatus(row: EventRow, next: EventStatusKey) {
    if (!publicKey) return;
    setBusyEvent(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = eventTicketsProgram(provider);
      const variant = { [next]: {} } as never;
      const ix = await program.methods
        .updateEventStatus(variant)
        .accounts({
          creator: publicKey,
          event: new PublicKey(row.address),
        })
        .instruction();
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyEvent(null);
    }
  }

  const mine = state.kind === "ready" ? state.mine : [];
  const pub = state.kind === "ready" ? state.public : [];

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Events
          </h1>
          <p style={{ color: "var(--shell-muted)", fontSize: "0.9rem" }}>
            Sell tickets as compressed NFTs. Buyers receive a cNFT ticket in their wallet — transferable, viewable in Phantom Collectibles, compatible with Tensor / Magic Eden for secondary markets.
          </p>
        </div>
        {connected ? (
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              background: "#4f46e5",
              color: "#fff",
              padding: "0.6rem 1.15rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
            }}
          >
            + Create event
          </button>
        ) : null}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Browse" value={pub.length.toString()} sub="Active, selling events" />
        <StatCard label="My events" value={mine.length.toString()} sub="Created by you" />
        <StatCard label="Platform fee" value={`${(feeBps / 100).toFixed(2)}%`} sub="On every ticket sale" />
        <StatCard label="Ticket format" value="cNFT" sub="Token-2022-free Bubblegum leaves" />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>
          Browse ({pub.length})
        </TabButton>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My events ({mine.length})
        </TabButton>
      </div>

      {state.kind === "loading" ? (
        <CenteredCard>Loading events…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed to load: {state.message}</CenteredCard>
      ) : tab === "browse" ? (
        pub.length === 0 ? (
          <CenteredCard>
            <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
              No events on sale yet
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)" }}>
              Be the first — click <strong>Create event</strong> above.
            </div>
          </CenteredCard>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {pub.map((e) => {
              const isOwn = connected && publicKey && publicKey.toBase58() === e.creator;
              return (
                <PublicEventCard
                  key={e.address}
                  event={e}
                  feeBps={feeBps}
                  isOwn={Boolean(isOwn)}
                  connected={connected}
                  busy={busyEvent === e.address}
                  qty={buyQty}
                  onQtyChange={setBuyQty}
                  onBuy={() => void buyTicket(e)}
                />
              );
            })}
          </div>
        )
      ) : !connected ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            Connect wallet
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
            Connect your wallet to create and manage events.
          </div>
          <WalletMultiButton />
        </CenteredCard>
      ) : mine.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            No events yet
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)" }}>
            Click <strong>Create event</strong> above to start selling cNFT tickets.
          </div>
        </CenteredCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {mine.map((e) => (
            <MyEventCard
              key={e.address}
              event={e}
              busy={busyEvent === e.address}
              onInitTree={() => void initializeTree(e)}
              onWithdraw={() => void withdrawRevenue(e)}
              onStatus={(next) => void transitionStatus(e, next)}
            />
          ))}
        </div>
      )}

      {createOpen && publicKey ? (
        <CreateEventModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (form) => {
            try {
              await createEvent(form);
              setCreateOpen(false);
            } catch (err) {
              toast.error(explainSolanaError(err));
            }
          }}
        />
      ) : null}
    </>
  );
}

function PublicEventCard({
  event,
  feeBps,
  isOwn,
  connected,
  busy,
  qty,
  onQtyChange,
  onBuy,
}: {
  event: EventRow;
  feeBps: number;
  isOwn: boolean;
  connected: boolean;
  busy: boolean;
  qty: string;
  onQtyChange: (v: string) => void;
  onBuy: () => void;
}) {
  const qtyNum = Math.max(1, Math.min(event.capacity - event.sold, Number(qty) || 1));
  const total = event.price * qtyNum;
  const fee = (total * feeBps) / 10_000;
  const creatorShare = total - fee;
  const left = event.capacity - event.sold;
  const endsDate = new Date(event.endsAt * 1000);
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link
        href={`/marketplace/events/v/${event.address}`}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div
          style={{
            background: event.imageUrl
              ? `center / cover no-repeat url(${event.imageUrl})`
              : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            height: 140,
            position: "relative",
          }}
        >
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
              color: "var(--shell-fg)",
            }}
          >
            cNFT ticket
          </div>
        </div>
      </Link>
      <div style={{ padding: "1rem 1.1rem 1.1rem", display: "flex", flexDirection: "column", flex: 1 }}>
        <Link
          href={`/marketplace/events/v/${event.address}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.15rem", lineHeight: 1.3 }}>
            {event.name || "(unnamed event)"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--shell-muted)", marginBottom: "0.8rem" }}>
            {event.symbol} · by {shorten(event.creator)}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.85rem" }}>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>${event.price.toFixed(2)}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)" }}>per ticket · USDC</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--shell-link)" }}>{left} left</div>
              <div style={{ fontSize: "0.7rem", color: "var(--shell-faint)" }}>of {event.capacity}</div>
            </div>
          </div>

          <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)", marginBottom: "0.85rem" }}>
            Sale ends {endsDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </Link>

        {!connected ? (
          <WalletMultiButton />
        ) : isOwn ? (
          <div style={{ padding: "0.55rem 1rem", background: "var(--shell-divider)", color: "var(--shell-muted)", textAlign: "center", borderRadius: 8, fontSize: "0.82rem" }}>
            Your event
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
            <input
              type="number"
              min={1}
              max={left}
              value={qty}
              onChange={(e) => onQtyChange(e.target.value)}
              style={{
                width: 60,
                background: "var(--shell-card)",
                border: "1px solid var(--shell-border-strong)",
                borderRadius: 8,
                color: "var(--shell-fg)",
                padding: "0.5rem 0.55rem",
                fontSize: "0.86rem",
                outline: "none",
                textAlign: "center",
              }}
            />
            <button
              onClick={onBuy}
              disabled={busy}
              style={{
                flex: 1,
                background: busy ? "#a5b4fc" : "#4f46e5",
                color: "#fff",
                border: "none",
                padding: "0.55rem 1rem",
                borderRadius: 8,
                fontSize: "0.86rem",
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
              }}
              title={`${creatorShare.toFixed(2)} to creator · ${fee.toFixed(2)} platform fee`}
            >
              {busy ? "Minting…" : `Buy ${qtyNum === 1 ? "ticket" : `${qtyNum}×`} for $${(event.price * qtyNum).toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MyEventCard({
  event,
  busy,
  onInitTree,
  onWithdraw,
  onStatus,
}: {
  event: EventRow;
  busy: boolean;
  onInitTree: () => void;
  onWithdraw: () => void;
  onStatus: (next: EventStatusKey) => void;
}) {
  const withdrawable = event.totalRevenue - event.totalWithdrawn;
  const endsDate = new Date(event.endsAt * 1000);
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>{event.name || "(unnamed)"}</div>
            <EventStatusPill status={event.status} />
            {event.treeInitialised ? null : (
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#b45309",
                  background: "rgba(245,158,11,0.12)",
                  padding: "0.18rem 0.55rem",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                Tree not initialised
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--shell-muted)" }}>
            {event.symbol} · event id {event.eventId} · sale ends {endsDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>${event.price.toFixed(2)}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)" }}>per ticket</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.75rem", marginBottom: "0.9rem" }}>
        <MiniStat label="Sold" value={`${event.sold} / ${event.capacity}`} />
        <MiniStat label="Gross revenue" value={`$${event.totalRevenue.toFixed(2)}`} />
        <MiniStat label="Withdrawable" value={`$${withdrawable.toFixed(2)}`} />
        <MiniStat label="Withdrawn" value={`$${event.totalWithdrawn.toFixed(2)}`} />
      </div>

      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        {!event.treeInitialised ? (
          <button style={btnPrimary} onClick={onInitTree} disabled={busy}>
            Initialize Merkle tree
          </button>
        ) : (
          <>
            {event.status === "active" ? (
              <button style={btnSecondary} onClick={() => onStatus("paused")} disabled={busy}>
                Pause sales
              </button>
            ) : event.status === "paused" ? (
              <button style={btnSecondary} onClick={() => onStatus("active")} disabled={busy}>
                Resume sales
              </button>
            ) : null}
            {event.status !== "closed" ? (
              <button style={btnSecondary} onClick={() => onStatus("closed")} disabled={busy}>
                Close
              </button>
            ) : null}
            <button style={btnSecondary} onClick={onWithdraw} disabled={busy || withdrawable <= 0}>
              Withdraw ${withdrawable.toFixed(2)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CreateEventModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: {
    name: string;
    symbol: string;
    price: number;
    capacity: number;
    durationHours: number;
    metadataUri: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [duration, setDuration] = useState("72");
  const [metadataUri, setMetadataUri] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const priceNum = Number(price);
  const capNum = Number(capacity);
  const durNum = Number(duration);

  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    Number.isInteger(capNum) &&
    capNum > 0 &&
    Number.isInteger(durNum) &&
    durNum > 0;

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
          background: "var(--shell-card)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
          width: 520,
          maxWidth: "92vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.35rem" }}>Create event</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--shell-muted)", marginBottom: "1.25rem" }}>
          Creates the Event PDA + USDC vault. You&apos;ll then initialise the Merkle tree before the first sale.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.9rem", marginBottom: "1rem" }}>
          <div>
            <Label>Event name</Label>
            <input style={input} placeholder="Exit Festival 2026" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Symbol</Label>
            <input style={input} placeholder="EXIT" maxLength={16} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.9rem", marginBottom: "1rem" }}>
          <div>
            <Label>Price (USDC)</Label>
            <input type="number" min={0} step="0.01" style={input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25.00" />
          </div>
          <div>
            <Label>Capacity</Label>
            <input type="number" min={1} style={input} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="500" />
          </div>
          <div>
            <Label>Sale window (hours)</Label>
            <input type="number" min={1} style={input} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <Label>Metadata URI (optional — Metaplex JSON for image + description)</Label>
          <input style={input} value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder="https://…" maxLength={256} />
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
                  name,
                  symbol,
                  price: priceNum,
                  capacity: capNum,
                  durationHours: durNum,
                  metadataUri,
                });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "var(--shell-card)", border: "1px solid var(--shell-border)", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--shell-fg)" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "var(--shell-faint)", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--shell-pill-bg)", border: "1px solid var(--shell-border)", borderRadius: 8, padding: "0.55rem 0.75rem" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--shell-muted)", marginBottom: "0.15rem" }}>{label}</div>
      <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
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

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: 8,
        border: "none",
        background: active ? "var(--shell-active-bg)" : "var(--shell-card)",
        color: active ? "var(--shell-link)" : "var(--shell-muted)",
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

function EventStatusPill({ status }: { status: EventStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    paused: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Paused" },
    closed: { bg: "rgba(107,114,128,0.12)", fg: "var(--shell-muted)", dot: "var(--shell-muted)", label: "Closed" },
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

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, marginBottom: "0.3rem" }}>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  color: "var(--shell-fg)",
  padding: "0.6rem 0.8rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.55rem 1.15rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  border: "1px solid var(--shell-border-strong)",
  padding: "0.55rem 1rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};
