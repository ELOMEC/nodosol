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
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  ACCOUNT_COMPRESSION_PROGRAM_ID,
  BUBBLEGUM_PROGRAM_ID,
  decodeEventStatus,
  EventStatusKey,
  eventTicketsProgram,
  fetchEventTicketsConfig,
  fetchTiersForEvent,
  NOOP_PROGRAM_ID,
  TicketTierDoc,
  tierPda,
  treeConfigPda,
} from "@/lib/eventTickets";
import {
  getVenueTemplate,
  VenueRegion,
  VenueTemplate,
} from "@/lib/venue-templates";
import {
  getEventVenueMapping,
  getVenueLayout,
  layoutToTemplate,
  VenueLayoutRegion,
} from "@/lib/venueLayouts";
import { confirmSeatMint, releaseReservation, reserveSeat } from "@/lib/seats";
import { SeatPicker } from "./SeatPicker";

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
  venueTemplate: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; event: EventData; tiers: TicketTierDoc[]; customTemplate: VenueTemplate | null }
  | { kind: "error"; message: string };

export function EventDetailView({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyTier, setBusyTier] = useState<number | null>(null);
  const [hoverTierId, setHoverTierId] = useState<number | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null);
  const [seatPicker, setSeatPicker] = useState<{
    tier: TicketTierDoc;
    region: VenueLayoutRegion;
  } | null>(null);

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
      let venueTemplate: string | null = null;
      if (raw.metadataUri) {
        try {
          const httpUri = raw.metadataUri.startsWith("ipfs://")
            ? raw.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
            : raw.metadataUri;
          const resp = await fetch(httpUri, { cache: "force-cache" });
          if (resp.ok) {
            const json = (await resp.json()) as {
              image?: string;
              description?: string;
              venueTemplate?: string;
            };
            if (json.image) imageUrl = json.image;
            if (json.description) description = json.description;
            if (json.venueTemplate) venueTemplate = json.venueTemplate;
          }
        } catch {
          // ignore
        }
      }

      const tiers = await fetchTiersForEvent(program, eventPk);

      let customTemplate: VenueTemplate | null = null;
      try {
        const mapping = await getEventVenueMapping(address);
        if (mapping) {
          const layout = await getVenueLayout(mapping.layoutId);
          if (layout) customTemplate = layoutToTemplate(layout);
        }
      } catch (err) {
        console.warn("venue layout lookup failed", err);
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
          venueTemplate,
        },
        tiers,
        customTemplate,
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

  function regionForTier(tier: TicketTierDoc): VenueLayoutRegion | null {
    if (state.kind !== "ready") return null;
    const template = state.customTemplate;
    if (!template) return null;
    const match = template.regions.find((r) => r.tierRef === tier.sectionCode);
    return (match as VenueLayoutRegion | undefined) ?? null;
  }

  function tierIsSeated(tier: TicketTierDoc): boolean {
    const r = regionForTier(tier);
    return !!r && (r.rows ?? 0) > 0 && (r.seatsPerRow ?? 0) > 0;
  }

  async function mintTicket(
    ev: EventData,
    tier: TicketTierDoc,
    seat: { rowLabel: string; seatNumber: number } | null
  ): Promise<string> {
    if (!publicKey) throw new Error("Wallet not connected");
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
    const eventPk = new PublicKey(ev.address);
    const [tierAddr] = tierPda(eventPk, tier.tierId);
    const ix = await program.methods
      .buyTierTicket(
        seat ? seat.rowLabel.slice(0, 4) : "",
        seat ? seat.seatNumber : 0
      )
      .accounts({
        buyer: publicKey,
        event: eventPk,
        tier: tierAddr,
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
    if (seat) {
      try {
        await confirmSeatMint({
          eventPubkey: ev.address,
          tierId: tier.tierId,
          rowLabel: seat.rowLabel,
          seatNumber: seat.seatNumber,
          ownerPubkey: publicKey.toBase58(),
          mintSig: sig,
        });
      } catch (err) {
        console.error("seat confirmation failed — mint succeeded on-chain", err);
      }
    }
    return sig;
  }

  async function buyTier(ev: EventData, tier: TicketTierDoc) {
    if (!publicKey) return;
    if (tierIsSeated(tier)) {
      const region = regionForTier(tier);
      if (region) {
        setSeatPicker({ tier, region });
        return;
      }
    }
    setBusyTier(tier.tierId);
    try {
      const sig = await mintTicket(ev, tier, null);
      window.alert(`Ticket minted: ${tier.name}. Tx: ${sig}`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setBusyTier(null);
    }
  }

  async function buySeatedTier(
    ev: EventData,
    tier: TicketTierDoc,
    seat: { rowLabel: string; seatNumber: number }
  ) {
    if (!publicKey) return;
    setBusyTier(tier.tierId);
    let reserved = false;
    try {
      await reserveSeat({
        eventPubkey: ev.address,
        tierId: tier.tierId,
        rowLabel: seat.rowLabel,
        seatNumber: seat.seatNumber,
        buyerPubkey: publicKey.toBase58(),
      });
      reserved = true;
      const sig = await mintTicket(ev, tier, seat);
      setSeatPicker(null);
      window.alert(`Ticket minted — ${tier.name} · ${seat.rowLabel}${seat.seatNumber}. Tx: ${sig}`);
      await load();
    } catch (err) {
      console.error(err);
      if (reserved) {
        try {
          await releaseReservation({
            eventPubkey: ev.address,
            tierId: tier.tierId,
            rowLabel: seat.rowLabel,
            seatNumber: seat.seatNumber,
          });
        } catch {
          // best effort
        }
      }
      window.alert(err instanceof Error ? err.message : "Buy failed");
    } finally {
      setBusyTier(null);
    }
  }

  const template = useMemo<VenueTemplate | null>(() => {
    if (state.kind !== "ready") return null;
    if (state.customTemplate) return state.customTemplate;
    const id = state.event.venueTemplate;
    return id ? getVenueTemplate(id) : null;
  }, [state]);

  const tierBySection = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, TicketTierDoc>();
    const m = new Map<string, TicketTierDoc>();
    for (const t of state.tiers) m.set(t.sectionCode, t);
    return m;
  }, [state]);

  const bestTier = useMemo(() => {
    if (state.kind !== "ready") return null;
    const available = state.tiers.filter((t) => t.capacity > t.sold && t.status === "active");
    if (available.length === 0) return null;
    return available.slice().sort((a, b) => a.price - b.price)[0];
  }, [state]);

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
  const tiers = state.tiers;
  const endsDate = new Date(ev.endsAt * 1000);
  const isOwn = publicKey?.toBase58() === ev.creator;

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
          background: ev.imageUrl
            ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.6)), center / cover no-repeat url(${ev.imageUrl})`
            : "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          borderRadius: 14,
          padding: "2rem 2rem 1.5rem",
          color: "#fff",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ fontSize: "0.78rem", opacity: 0.85, fontWeight: 600, letterSpacing: 0.6, marginBottom: "0.35rem" }}>
          {ev.symbol} · EVENT #{ev.eventId}
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>
          {ev.name || "(unnamed event)"}
        </h1>
        {ev.description ? (
          <p style={{ fontSize: "0.95rem", opacity: 0.92, maxWidth: 780, lineHeight: 1.55 }}>{ev.description}</p>
        ) : null}
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", fontSize: "0.82rem", opacity: 0.92, flexWrap: "wrap" }}>
          <span>Sale ends {endsDate.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span>{ev.capacity - ev.sold} / {ev.capacity} available</span>
          <span>Creator {shorten(ev.creator)}</span>
        </div>
      </div>

      {tiers.length === 0 ? (
        <EmptyTiers isOwn={isOwn} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: template ? "minmax(0, 1.4fr) minmax(0, 1fr)" : "1fr",
            gap: "1.5rem",
            alignItems: "flex-start",
          }}
        >
          {template ? (
            <VenueMap
              template={template}
              tierBySection={tierBySection}
              hoverTierId={hoverTierId}
              selectedTierId={selectedTierId}
              onHover={setHoverTierId}
              onSelect={setSelectedTierId}
              bestTierId={bestTier?.tierId ?? null}
            />
          ) : null}

          <div>
            <div style={{ marginBottom: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{tiers.length} categories</h2>
              {bestTier ? (
                <span style={{ fontSize: "0.8rem", color: "var(--shell-muted, #6b7280)" }}>
                  Best price <strong style={{ color: "#059669" }}>${(bestTier.price / 1_000_000).toFixed(2)}</strong>
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
              {tiers
                .slice()
                .sort((a, b) => a.price - b.price)
                .map((t) => (
                  <TierRow
                    key={t.address}
                    tier={t}
                    selected={selectedTierId === t.tierId}
                    hovered={hoverTierId === t.tierId}
                    isBest={bestTier?.tierId === t.tierId}
                    connected={connected}
                    busy={busyTier === t.tierId}
                    isOwn={isOwn}
                    saleOpen={ev.status === "active" && ev.treeInitialised && Date.now() / 1000 < ev.endsAt}
                    onHover={() => setHoverTierId(t.tierId)}
                    onLeave={() => setHoverTierId(null)}
                    onClick={() => setSelectedTierId((prev) => (prev === t.tierId ? null : t.tierId))}
                    onBuy={() => void buyTier(ev, t)}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
      {seatPicker && (
        <SeatPicker
          eventPubkey={ev.address}
          tierId={seatPicker.tier.tierId}
          tierName={seatPicker.tier.name}
          region={seatPicker.region}
          busy={busyTier === seatPicker.tier.tierId}
          onCancel={() => {
            if (busyTier === null) setSeatPicker(null);
          }}
          onPick={(seat) => void buySeatedTier(ev, seatPicker.tier, seat)}
        />
      )}
    </>
  );
}

function VenueMap({
  template,
  tierBySection,
  hoverTierId,
  selectedTierId,
  onHover,
  onSelect,
  bestTierId,
}: {
  template: VenueTemplate;
  tierBySection: Map<string, TicketTierDoc>;
  hoverTierId: number | null;
  selectedTierId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number | null) => void;
  bestTierId: number | null;
}) {
  const [, , vbW, vbH] = template.viewBox.split(" ").map(Number);
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 14,
        padding: "1rem 1rem 0.75rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Venue layout</h3>
        <span style={{ fontSize: "0.72rem", color: "var(--shell-muted, #9ca3af)" }}>
          {template.name} · hover a zone
        </span>
      </div>

      <svg
        viewBox={template.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => onHover(null)}
      >
        {template.stage ? (
          <>
            <path d={template.stage.d} fill="#1f2937" />
            <text
              x={vbW / 2}
              y={vbH - 30}
              textAnchor="middle"
              fontSize={16}
              fontWeight={600}
              fill="#fff"
            >
              {template.stage.label}
            </text>
          </>
        ) : null}

        {template.regions.map((r) => (
          <RegionPath
            key={r.tierRef}
            region={r}
            tier={tierBySection.get(r.tierRef) ?? null}
            isHover={hoverTierId !== null && tierBySection.get(r.tierRef)?.tierId === hoverTierId}
            isSelected={selectedTierId !== null && tierBySection.get(r.tierRef)?.tierId === selectedTierId}
            isBest={bestTierId !== null && tierBySection.get(r.tierRef)?.tierId === bestTierId}
            onEnter={(id) => onHover(id)}
            onClick={(id) => onSelect(id)}
          />
        ))}
      </svg>
    </div>
  );
}

function RegionPath({
  region,
  tier,
  isHover,
  isSelected,
  isBest,
  onEnter,
  onClick,
}: {
  region: VenueRegion;
  tier: TicketTierDoc | null;
  isHover: boolean;
  isSelected: boolean;
  isBest: boolean;
  onEnter: (id: number | null) => void;
  onClick: (id: number | null) => void;
}) {
  const fill = tier
    ? tier.status !== "active" || tier.sold >= tier.capacity
      ? "#d1d5db"
      : tier.colorHex
    : "#e5e7eb";
  const labelAnchor = region.labelAnchor ?? { x: 500, y: 350 };
  const priceText = tier ? `$${(tier.price / 1_000_000).toFixed(0)}` : "—";
  const left = tier ? tier.capacity - tier.sold : 0;

  return (
    <g
      style={{ cursor: tier ? "pointer" : "default" }}
      onMouseEnter={() => onEnter(tier?.tierId ?? null)}
      onClick={() => onClick(tier?.tierId ?? null)}
    >
      <path
        d={region.d}
        fill={fill}
        fillOpacity={isHover || isSelected ? 1 : 0.82}
        stroke={isSelected ? "#111827" : isHover ? "#111827" : "#fff"}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      <text
        x={labelAnchor.x}
        y={labelAnchor.y}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="#fff"
        style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}
      >
        {region.label}
      </text>
      <text
        x={labelAnchor.x}
        y={labelAnchor.y + 17}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        fill="#fff"
        style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}
      >
        {priceText}
        {tier ? ` · ${left} left` : ""}
      </text>
      {isBest && tier ? (
        <circle
          cx={labelAnchor.x - 50}
          cy={labelAnchor.y - 6}
          r={6}
          fill="#10b981"
          stroke="#fff"
          strokeWidth={2}
        />
      ) : null}
    </g>
  );
}

function TierRow({
  tier,
  selected,
  hovered,
  isBest,
  connected,
  busy,
  isOwn,
  saleOpen,
  onHover,
  onLeave,
  onClick,
  onBuy,
}: {
  tier: TicketTierDoc;
  selected: boolean;
  hovered: boolean;
  isBest: boolean;
  connected: boolean;
  busy: boolean;
  isOwn: boolean;
  saleOpen: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  onBuy: () => void;
}) {
  const priceUsdc = tier.price / 1_000_000;
  const left = tier.capacity - tier.sold;
  const soldOut = left <= 0;
  const inactive = tier.status !== "active";
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        background: selected
          ? "var(--shell-active-bg, #eef2ff)"
          : hovered
            ? "var(--shell-pill-bg, #f7f8fa)"
            : "var(--shell-card, #fff)",
        border: `1px solid ${selected ? "#4338ca" : "var(--shell-border, #eef0f3)"}`,
        borderRadius: 10,
        padding: "0.75rem 0.9rem",
        display: "grid",
        gridTemplateColumns: "12px 1fr auto",
        gap: "0.75rem",
        alignItems: "center",
        cursor: "pointer",
        transition: "border-color 80ms, background 80ms",
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: tier.colorHex,
          display: "inline-block",
        }}
      />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: 2 }}>
          <span style={{ fontSize: "0.92rem", fontWeight: 600 }}>{tier.name}</span>
          {tier.sectionCode !== tier.name ? (
            <span
              style={{
                fontSize: "0.68rem",
                color: "var(--shell-muted, #6b7280)",
                background: "var(--shell-pill-bg, #f7f8fa)",
                padding: "0.05rem 0.35rem",
                borderRadius: 4,
                letterSpacing: 0.3,
              }}
            >
              Section {tier.sectionCode}
            </span>
          ) : null}
          {isBest ? (
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                color: "#065f46",
                background: "rgba(16,185,129,0.15)",
                padding: "0.05rem 0.4rem",
                borderRadius: 4,
              }}
            >
              Best price
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: "0.76rem", color: "var(--shell-muted, #6b7280)" }}>
          {soldOut ? "Sold out" : inactive ? "Paused" : `${left} of ${tier.capacity} available`}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>${priceUsdc.toFixed(priceUsdc >= 100 ? 0 : 2)}</div>
          <div style={{ fontSize: "0.65rem", color: "var(--shell-muted, #9ca3af)" }}>USDC</div>
        </div>
        {!connected ? (
          <WalletMultiButton />
        ) : isOwn ? null : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBuy();
            }}
            disabled={busy || soldOut || inactive || !saleOpen}
            style={{
              background: soldOut || inactive || !saleOpen ? "#e5e7eb" : busy ? "#a5b4fc" : "#4f46e5",
              color: soldOut || inactive || !saleOpen ? "#6b7280" : "#fff",
              border: "none",
              padding: "0.5rem 0.9rem",
              borderRadius: 8,
              fontSize: "0.84rem",
              fontWeight: 600,
              cursor: busy || soldOut || inactive || !saleOpen ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Minting…" : soldOut ? "Sold out" : inactive ? "Paused" : "Buy"}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyTiers({ isOwn }: { isOwn: boolean }) {
  return (
    <Centered>
      <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>No seating categories yet</div>
      <div style={{ fontSize: "0.85rem", color: "var(--shell-muted, #6b7280)" }}>
        {isOwn
          ? "Add tiers from the Events page to start selling."
          : "This event hasn't published any seating categories."}
      </div>
    </Centered>
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
