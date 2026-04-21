"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { CheckInDoc, listCheckInsForEvent } from "@/lib/checkIns";
import {
  decodeEventStatus,
  EventStatusKey,
  eventTicketsProgram,
  fetchTiersForEvent,
  TicketTierDoc,
} from "@/lib/eventTickets";
import { getSupabaseClient } from "@/lib/supabase";

type EventMeta = {
  address: string;
  creator: string;
  eventId: string;
  name: string;
  symbol: string;
  capacity: number;
  sold: number;
  priceUsdc: number;
  totalRevenueUsdc: number;
  totalWithdrawnUsdc: number;
  withdrawableUsdc: number;
  startsAt: number;
  endsAt: number;
  status: EventStatusKey;
  treeInitialised: boolean;
};

type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      event: EventMeta;
      tiers: TicketTierDoc[];
      checkIns: CheckInDoc[];
      seatedCount: number;
    }
  | { kind: "error"; message: string };

export function EventDashboardView({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      const eventPk = new PublicKey(address);
      const api = (program.account as Record<string, {
        fetch: (addr: PublicKey) => Promise<{
          creator: PublicKey;
          eventId: BN;
          name: string;
          symbol: string;
          capacity: BN;
          sold: BN;
          price: BN;
          totalRevenue: BN;
          totalWithdrawn: BN;
          startsAt: BN;
          endsAt: BN;
          status: Record<string, unknown>;
          treeInitialised: boolean;
        }>;
      }>).event;
      const raw = await api.fetch(eventPk);
      const totalRevenue = Number(raw.totalRevenue.toString()) / USDC_UNIT;
      const totalWithdrawn = Number(raw.totalWithdrawn.toString()) / USDC_UNIT;
      const event: EventMeta = {
        address,
        creator: raw.creator.toBase58(),
        eventId: raw.eventId.toString(),
        name: raw.name,
        symbol: raw.symbol,
        capacity: raw.capacity.toNumber(),
        sold: raw.sold.toNumber(),
        priceUsdc: Number(raw.price.toString()) / USDC_UNIT,
        totalRevenueUsdc: totalRevenue,
        totalWithdrawnUsdc: totalWithdrawn,
        withdrawableUsdc: Math.max(0, totalRevenue - totalWithdrawn),
        startsAt: raw.startsAt.toNumber(),
        endsAt: raw.endsAt.toNumber(),
        status: decodeEventStatus(raw.status),
        treeInitialised: raw.treeInitialised,
      };

      const [tiers, checkIns, seatedCount] = await Promise.all([
        fetchTiersForEvent(program, eventPk),
        listCheckInsForEvent(address, 20),
        countSeatsMintedForEvent(address),
      ]);

      setState({ kind: "ready", event, tiers, checkIns, seatedCount });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [address, connection, wallet]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!connected) {
    return (
      <Shell title="Event dashboard">
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Connect the creator wallet to see this event&apos;s stats.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      </Shell>
    );
  }

  if (state.kind === "loading") {
    return <Shell title="Event dashboard"><Card><Centered>Loading event…</Centered></Card></Shell>;
  }
  if (state.kind === "error") {
    return <Shell title="Event dashboard"><Card><Centered>Failed: {state.message}</Centered></Card></Shell>;
  }

  const { event, tiers, checkIns, seatedCount } = state;
  const isOwner = publicKey?.toBase58() === event.creator;
  const sellThroughPct = event.capacity > 0 ? (event.sold / event.capacity) * 100 : 0;
  const checkInPct = event.sold > 0 ? (checkIns.length / event.sold) * 100 : 0;
  const isSeatedEvent = seatedCount > 0;

  return (
    <Shell
      title={event.name || "(unnamed event)"}
      subtitle={
        <>
          {event.symbol} · id {event.eventId} ·{" "}
          <Link href="/creator/events" style={{ color: "#6b7280", textDecoration: "none" }}>
            ← All events
          </Link>
        </>
      }
    >
      {!isOwner && (
        <div
          style={{
            padding: "0.6rem 0.85rem",
            background: "#fef3c7",
            color: "#92400e",
            borderRadius: 8,
            fontSize: "0.82rem",
            marginBottom: "1rem",
          }}
        >
          Viewing stats for an event you don&apos;t own — some numbers are still visible but you can&apos;t take actions.
        </div>
      )}

      <StatGrid
        stats={[
          {
            label: "Tickets sold",
            value: `${event.sold} / ${event.capacity}`,
            sub: `${sellThroughPct.toFixed(1)}% of capacity`,
          },
          {
            label: "Revenue",
            value: `$${event.totalRevenueUsdc.toFixed(2)}`,
            sub: `Creator share after ${(event.totalRevenueUsdc > 0 ? 0 : 0).toFixed(0)}% platform fee`,
          },
          {
            label: "Withdrawable",
            value: `$${event.withdrawableUsdc.toFixed(2)}`,
            sub: `$${event.totalWithdrawnUsdc.toFixed(2)} withdrawn so far`,
          },
          {
            label: "Checked in",
            value: `${checkIns.length} / ${event.sold}`,
            sub: `${checkInPct.toFixed(0)}% of ticket holders through the door`,
          },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <Card>
          <SectionTitle>Tiers ({tiers.length})</SectionTitle>
          {tiers.length === 0 ? (
            <Centered>
              No tiers yet.{" "}
              <Link href={`/creator/events/${address}/tiers`} style={{ color: "#4f46e5", fontWeight: 600 }}>
                Configure →
              </Link>
            </Centered>
          ) : (
            <TierTable tiers={tiers} totalSold={event.sold} />
          )}
        </Card>

        <Card>
          <SectionTitle>Recent check-ins ({checkIns.length})</SectionTitle>
          {checkIns.length === 0 ? (
            <Centered>
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                Nobody has been scanned yet.{" "}
                <Link href={`/creator/events/${address}/scan`} style={{ color: "#4f46e5", fontWeight: 600 }}>
                  Open scanner →
                </Link>
              </div>
            </Centered>
          ) : (
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {checkIns.slice(0, 10).map((c) => (
                <CheckInRow key={c.id} checkIn={c} />
              ))}
              {checkIns.length > 10 && (
                <div style={{ fontSize: "0.72rem", color: "#6b7280", textAlign: "right" }}>
                  + {checkIns.length - 10} more
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <ActionBtn href={`/creator/events/${address}/tiers`}>Tiers & venue</ActionBtn>
        <ActionBtn href={`/creator/events/${address}/scan`}>Door scan</ActionBtn>
        <ActionBtn href={`/marketplace/events/v/${address}`} external>
          Preview buyer page
        </ActionBtn>
      </div>

      {isSeatedEvent && (
        <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "#6b7280" }}>
          Seated reservations stored off-chain: {seatedCount} minted so far.
        </div>
      )}
    </Shell>
  );
}

async function countSeatsMintedForEvent(eventPubkey: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("tier_seats")
    .select("id", { count: "exact", head: true })
    .eq("event_pubkey", eventPubkey)
    .eq("status", "minted");
  if (error) {
    console.warn("count minted seats failed", error);
    return 0;
  }
  return count ?? 0;
}

function TierTable({ tiers, totalSold }: { tiers: TicketTierDoc[]; totalSold: number }) {
  const sorted = useMemo(() => tiers.slice().sort((a, b) => b.price - a.price), [tiers]);
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      {sorted.map((t) => {
        const remaining = t.capacity - t.sold;
        const sellPct = t.capacity > 0 ? (t.sold / t.capacity) * 100 : 0;
        const revenueUsdc = (t.sold * t.price) / USDC_UNIT;
        const shareOfTotal = totalSold > 0 ? (t.sold / totalSold) * 100 : 0;
        return (
          <div
            key={t.address}
            style={{
              border: "1px solid var(--shell-border, #eef0f3)",
              borderRadius: 8,
              padding: "0.6rem 0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.4rem" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: t.colorHex,
                  borderRadius: 3,
                }}
              />
              <div style={{ fontSize: "0.86rem", fontWeight: 600, flex: 1 }}>
                {t.name}
                <span style={{ color: "#9ca3af", fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                  {t.sectionCode}
                </span>
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: t.status === "active" ? "var(--shell-fg, #111827)" : "#9ca3af" }}>
                ${(t.price / USDC_UNIT).toFixed(2)}
              </div>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--shell-pill-bg, #f3f4f6)",
                borderRadius: 3,
                overflow: "hidden",
                marginBottom: "0.3rem",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, sellPct)}%`,
                  height: "100%",
                  background: t.colorHex,
                  transition: "width 200ms",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#6b7280" }}>
              <span>
                {t.sold}/{t.capacity} sold · {remaining} left
              </span>
              <span>
                ${revenueUsdc.toFixed(2)} revenue · {shareOfTotal.toFixed(0)}% of total sold
              </span>
            </div>
            {t.status !== "active" && (
              <div
                style={{
                  marginTop: "0.3rem",
                  display: "inline-block",
                  padding: "0.1rem 0.45rem",
                  background: "#fef3c7",
                  color: "#92400e",
                  borderRadius: 999,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t.status}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckInRow({ checkIn }: { checkIn: CheckInDoc }) {
  const when = new Date(checkIn.checkedInAt);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "0.55rem",
        alignItems: "center",
        padding: "0.45rem 0.6rem",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: checkIn.rowLabel ? "#4f46e5" : "#9ca3af",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.7rem",
          fontWeight: 700,
        }}
      >
        {checkIn.rowLabel ? `${checkIn.rowLabel}${checkIn.seatNumber}` : "GA"}
      </div>
      <div>
        <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>
          {checkIn.rowLabel && checkIn.seatNumber
            ? `Row ${checkIn.rowLabel}, Seat ${checkIn.seatNumber}`
            : "General admission"}
        </div>
        <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>
          {checkIn.ownerPubkey
            ? `${checkIn.ownerPubkey.slice(0, 6)}…${checkIn.ownerPubkey.slice(-4)}`
            : "holder unknown"}
        </div>
      </div>
      <div style={{ fontSize: "0.68rem", color: "#6b7280", whiteSpace: "nowrap" }}>
        {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: string; sub: string }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.85rem",
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: "var(--shell-card, #fff)",
            border: "1px solid var(--shell-border, #eef0f3)",
            borderRadius: 12,
            padding: "1rem 1.1rem",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "0.4rem" }}>
            {s.label}
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{s.value}</div>
          <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.2rem" }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ActionBtn({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "0.5rem 1.05rem",
        borderRadius: 8,
        border: "1px solid var(--shell-border, #eef0f3)",
        background: "var(--shell-pill-bg, #f7f8fa)",
        color: "var(--shell-fg, #111827)",
        fontSize: "0.85rem",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      {children}
      {external ? " ↗" : ""}
    </Link>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", marginBottom: "0.25rem", fontWeight: 600 }}>
          {title}
        </h1>
        {subtitle && <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>{subtitle}</div>}
      </header>
      {children}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.2rem",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.6rem" }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>
      {children}
    </div>
  );
}
