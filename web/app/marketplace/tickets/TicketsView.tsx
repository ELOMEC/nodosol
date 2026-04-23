"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { eventTicketsProgram } from "@/lib/eventTickets";
import { filterCompressed, getAssetsByOwner, HeliusAsset } from "@/lib/helius";
import { toHttp } from "@/lib/metadataImages";
import { parseSeatFromName } from "@/lib/ticketName";

type EventIndex = Map<
  string,
  {
    address: string;
    name: string;
    symbol: string;
    creator: string;
    merkleTree: string;
    priceUsdc: number;
  }
>;

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      tickets: TicketRow[];
      unknownCompressed: HeliusAsset[];
      /** True when the Event PDA index couldn't be fetched — ticket↔event
       *  matching is best-effort in that case. */
      indexDegraded: boolean;
    }
  | { kind: "error"; message: string };

type TicketRow = {
  assetId: string;
  tree: string;
  leafId: number | null;
  name: string;
  image: string | null;
  description: string | null;
  // Event metadata (if we matched the tree to an on-chain Event PDA).
  event: {
    address: string;
    name: string;
    symbol: string;
    priceUsdc: number;
  } | null;
};

export function TicketsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      // 1. Build index of event PDAs → metadata by scanning event_tickets.
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      let indexDegraded = false;
      const program = eventTicketsProgram(provider);
      const api = (program.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
            creator: PublicKey;
            name: string;
            symbol: string;
            merkleTree: PublicKey;
            price: BN;
          };
        }>>;
      }>).event;
      let index: EventIndex = new Map();
      try {
        const items = await api.all();
        index = new Map(
          items
            .filter((x) => !x.account.merkleTree.equals(PublicKey.default))
            .map((x) => [
              x.account.merkleTree.toBase58(),
              {
                address: x.publicKey.toBase58(),
                name: x.account.name,
                symbol: x.account.symbol,
                creator: x.account.creator.toBase58(),
                merkleTree: x.account.merkleTree.toBase58(),
                priceUsdc: Number(x.account.price.toString()) / USDC_UNIT,
              },
            ])
        );
      } catch (err) {
        console.warn("event index fetch failed; ticket matching will be partial", err);
        indexDegraded = true;
      }

      // 2. Fetch all compressed assets owned by the wallet via Helius DAS.
      let owned: HeliusAsset[] = [];
      try {
        owned = await getAssetsByOwner(publicKey.toBase58());
      } catch (err) {
        console.error("Helius DAS fetch failed", err);
        setState({
          kind: "error",
          message:
            "We couldn't load your tickets from the indexer right now. Please try again in a moment.",
        });
        return;
      }
      const compressed = filterCompressed(owned);

      // 3. Join against the event index.
      const tickets: TicketRow[] = [];
      const unknownCompressed: HeliusAsset[] = [];
      for (const a of compressed) {
        const tree = a.compression?.tree ?? "";
        const event = index.get(tree);
        const name = a.content?.metadata?.name ?? "(unnamed)";
        const description = a.content?.metadata?.description ?? null;
        const image = a.content?.links?.image ?? null;
        if (event) {
          tickets.push({
            assetId: a.id,
            tree,
            leafId: a.compression?.leaf_id ?? null,
            name,
            image,
            description,
            event,
          });
        } else {
          unknownCompressed.push(a);
        }
      }

      setState({ kind: "ready", tickets, unknownCompressed, indexDegraded });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          My tickets
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Compressed NFT tickets held in your wallet, joined with the event metadata on-chain. Bubblegum leaves are fetched via Helius DAS.
        </p>
      </header>

      {!connected ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            Connect wallet
          </div>
          <WalletMultiButton />
        </CenteredCard>
      ) : state.kind === "loading" ? (
        <CenteredCard>Loading tickets from Helius DAS…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>
          <div style={{ fontWeight: 600, color: "#111827", marginBottom: "0.4rem" }}>Could not load tickets</div>
          <div style={{ fontSize: "0.88rem" }}>{state.message}</div>
          <button onClick={() => void reload()} style={{ marginTop: "1rem", ...btnSecondary }}>
            Retry
          </button>
        </CenteredCard>
      ) : state.kind === "ready" ? (
        <ReadyView
          tickets={state.tickets}
          unknown={state.unknownCompressed}
          indexDegraded={state.indexDegraded}
          onReload={() => void reload()}
        />
      ) : null}
    </>
  );
}

function ReadyView({
  tickets,
  unknown,
  indexDegraded,
  onReload,
}: {
  tickets: TicketRow[];
  unknown: HeliusAsset[];
  indexDegraded: boolean;
  onReload: () => void;
}) {
  return (
    <>
      {indexDegraded ? (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            borderRadius: 8,
            padding: "0.65rem 0.85rem",
            fontSize: "0.82rem",
            marginBottom: "1rem",
          }}
        >
          The event index is temporarily unavailable, so some tickets may
          show as &ldquo;Other cNFTs&rdquo; until it comes back. Your tickets are
          safe on-chain — this only affects matching.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Event tickets" value={tickets.length.toString()} sub="matched to an on-chain event" />
        <StatCard label="Other cNFTs" value={unknown.length.toString()} sub="compressed assets not tied to a nodosol event" />
        <StatCard label="Total compressed" value={(tickets.length + unknown.length).toString()} sub="Bubblegum leaves owned" />
      </div>

      {tickets.length === 0 && unknown.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            No compressed NFTs yet
          </div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1.1rem" }}>
            Once you buy an event ticket on <Link href="/marketplace/events" style={{ color: "#4338ca" }}>/marketplace/events</Link>, the cNFT will appear here within seconds.
          </div>
          <button style={btnSecondary} onClick={onReload}>Refresh</button>
        </CenteredCard>
      ) : null}

      {tickets.length > 0 ? (
        <section style={{ marginBottom: "2rem" }}>
          <h3 style={sectionTitleStyle}>Nodosol event tickets</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {tickets.map((t) => (
              <TicketCard key={t.assetId} ticket={t} />
            ))}
          </div>
        </section>
      ) : null}

      {unknown.length > 0 ? (
        <section>
          <h3 style={sectionTitleStyle}>Other compressed NFTs</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
            {unknown.map((a) => (
              <GenericCnftCard key={a.id} asset={a} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function TicketCard({ ticket }: { ticket: TicketRow }) {
  const explorerUrl = `https://explorer.solana.com/address/${ticket.assetId}?cluster=devnet`;
  const seat = parseSeatFromName(ticket.name);
  return (
    <Link
      href={`/marketplace/tickets/${ticket.assetId}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, overflow: "hidden" }}>
      <div
        style={{
          height: 140,
          background: ticket.image ? "#111" : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {ticket.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toHttp(ticket.image)}
            alt={ticket.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(255,255,255,0.92)",
            color: "#374151",
            padding: "0.18rem 0.55rem",
            borderRadius: 4,
            fontSize: "0.7rem",
            fontWeight: 600,
          }}
        >
          cNFT ticket
        </div>
        {seat && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "#4f46e5",
              color: "#fff",
              padding: "0.2rem 0.6rem",
              borderRadius: 5,
              fontSize: "0.74rem",
              fontWeight: 700,
              letterSpacing: "0.03em",
            }}
          >
            Row {seat.rowLabel} · Seat {seat.seatNumber}
          </div>
        )}
      </div>
      <div style={{ padding: "0.95rem 1.05rem 1.05rem" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem" }}>{ticket.name}</div>
        {ticket.event ? (
          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.7rem" }}>
            Event {ticket.event.symbol} · paid ${ticket.event.priceUsdc.toFixed(2)}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
          <code style={{ fontSize: "0.7rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
            {shorten(ticket.assetId)}
          </code>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: "0.75rem", color: "#4338ca", fontWeight: 600, textDecoration: "none" }}
          >
            Explorer ↗
          </a>
        </div>
      </div>
    </div>
    </Link>
  );
}

function GenericCnftCard({ asset }: { asset: HeliusAsset }) {
  const name = asset.content?.metadata?.name ?? "(unnamed)";
  const image = asset.content?.links?.image;
  const explorerUrl = `https://explorer.solana.com/address/${asset.id}?cluster=devnet`;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, overflow: "hidden" }}>
      <div
        style={{
          height: 100,
          background: image ? "#111" : "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toHttp(image)}
            alt={name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
      </div>
      <div style={{ padding: "0.85rem 1rem 0.95rem" }}>
        <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.2rem" }}>{name}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
          <code style={{ fontSize: "0.68rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
            {shorten(asset.id)}
          </code>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.72rem", color: "#4338ca", fontWeight: 600, textDecoration: "none" }}
          >
            Explorer ↗
          </a>
        </div>
      </div>
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

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#6b7280",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontWeight: 600,
  marginBottom: "0.75rem",
};

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.5rem 1rem",
  borderRadius: 8,
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};
