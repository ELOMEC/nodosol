"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  decodeEventStatus,
  EventStatusKey,
  eventTicketsProgram,
} from "@/lib/eventTickets";

type EventRow = {
  address: string;
  eventId: string;
  name: string;
  symbol: string;
  price: number;
  capacity: number;
  sold: number;
  startsAt: number;
  status: EventStatusKey;
  treeInitialised: boolean;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; events: EventRow[] }
  | { kind: "error"; message: string };

export function CreatorEventsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      const api = (program.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            creator: PublicKey;
            eventId: BN;
            price: BN;
            capacity: BN;
            sold: BN;
            startsAt: BN;
            status: Record<string, unknown>;
            name: string;
            symbol: string;
            treeInitialised: boolean;
          };
        }>>;
      }>).event;
      const items = await api.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      const events: EventRow[] = items
        .map(({ publicKey: addr, account }) => ({
          address: addr.toBase58(),
          eventId: account.eventId.toString(),
          name: account.name,
          symbol: account.symbol,
          price: Number(account.price.toString()) / USDC_UNIT,
          capacity: account.capacity.toNumber(),
          sold: account.sold.toNumber(),
          startsAt: account.startsAt.toNumber(),
          status: decodeEventStatus(account.status),
          treeInitialised: account.treeInitialised,
        }))
        .sort((a, b) => b.startsAt - a.startsAt);
      setState({ kind: "ready", events });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  return (
    <>
      <header style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            My events
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem" }}>
            Manage multi-tier pricing, venue layout, and ticket inventory for events you&apos;ve created on-chain.
          </p>
        </div>
        <Link
          href="/marketplace/events"
          style={{
            background: "#4f46e5",
            color: "#fff",
            padding: "0.55rem 1.1rem",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + New event
        </Link>
      </header>

      {!connected ? (
        <Card>
          <Centered>
            <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
              Connect wallet
            </div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Connect the wallet you used to create events.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      ) : state.kind === "loading" ? (
        <Card><Centered>Loading events…</Centered></Card>
      ) : state.kind === "error" ? (
        <Card><Centered>Failed: {state.message}</Centered></Card>
      ) : state.kind === "ready" ? (
        state.events.length === 0 ? (
          <Card>
            <Centered>
              <div style={{ fontSize: "0.95rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
                No events yet
              </div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
                Create your first event on the marketplace, then come back here to set up tiers.
              </div>
              <Link
                href="/marketplace/events"
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  padding: "0.5rem 1rem",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Create event →
              </Link>
            </Centered>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {state.events.map((e) => (
              <EventCard key={e.address} event={e} />
            ))}
          </div>
        )
      ) : null}
    </>
  );
}

function EventCard({ event }: { event: EventRow }) {
  const startsAt = new Date(event.startsAt * 1000);
  const sellThrough = event.capacity > 0 ? (event.sold / event.capacity) * 100 : 0;

  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1.1rem 1.25rem",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "1rem",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", marginBottom: "0.3rem" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--shell-fg, #111827)" }}>
            {event.name || "(unnamed)"}
          </div>
          <StatusPill status={event.status} />
          {!event.treeInitialised && (
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.12rem 0.5rem",
                borderRadius: 999,
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: 600,
              }}
            >
              Tree pending
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>{event.symbol} · id {event.eventId}</span>
          <span>${event.price.toFixed(2)} base</span>
          <span>{event.sold}/{event.capacity} sold ({sellThrough.toFixed(0)}%)</span>
          <span>{startsAt.toLocaleString()}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <Link
          href={`/creator/events/${event.address}/tiers`}
          style={{
            padding: "0.5rem 0.9rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-pill-bg, #f7f8fa)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.8rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Tiers & venue
        </Link>
        <Link
          href={`/marketplace/events/v/${event.address}`}
          style={{
            padding: "0.5rem 0.9rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "transparent",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.8rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Preview →
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: EventStatusKey }) {
  const colors: Record<EventStatusKey, { bg: string; fg: string }> = {
    active: { bg: "#dcfce7", fg: "#166534" },
    paused: { bg: "#fef3c7", fg: "#92400e" },
    closed: { bg: "#f3f4f6", fg: "#4b5563" },
  };
  const c = colors[status];
  return (
    <span
      style={{
        fontSize: "0.68rem",
        padding: "0.12rem 0.5rem",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {status}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.25rem",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}
