"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { eventTicketsProgram, fetchTiersForEvent, TicketTierDoc } from "@/lib/eventTickets";
import { getAsset, HeliusAsset } from "@/lib/helius";
import { toHttp } from "@/lib/metadataImages";
import { parseSeatFromName, parseTierLabelFromName } from "@/lib/ticketName";
import { getVenueTemplate, VenueTemplate } from "@/lib/venue-templates";
import {
  getEventVenueMapping,
  getVenueLayout,
  layoutToTemplate,
  rowLabelsFor,
  VenueLayoutRegion,
} from "@/lib/venueLayouts";

type EventMeta = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  merkleTree: string;
  priceUsdc: number;
  venueTemplate: string | null;
};

type Loaded = {
  asset: HeliusAsset;
  event: EventMeta | null;
  template: VenueTemplate | null;
  matchedTier: TicketTierDoc | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; loaded: Loaded }
  | { kind: "error"; message: string };

export function TicketDetailView({ assetId }: { assetId: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const asset = await getAsset(assetId);
      if (!asset) {
        setState({ kind: "error", message: "Ticket not found on Helius DAS." });
        return;
      }

      // Resolve the on-chain event by matching the cNFT's merkle tree to an
      // Event.merkle_tree. Falls back to null if this cNFT isn't a nodosol ticket.
      let event: EventMeta | null = null;
      let template: VenueTemplate | null = null;
      let matchedTier: TicketTierDoc | null = null;

      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);
      try {
        const api = (program.account as Record<string, {
          all: () => Promise<Array<{
            publicKey: PublicKey;
            account: {
              creator: PublicKey;
              name: string;
              symbol: string;
              merkleTree: PublicKey;
              price: BN;
              metadataUri: string;
            };
          }>>;
        }>).event;
        const items = await api.all();
        const tree = asset.compression?.tree;
        const hit = tree
          ? items.find((x) => x.account.merkleTree.toBase58() === tree)
          : undefined;
        if (hit) {
          let venueTemplate: string | null = null;
          if (hit.account.metadataUri) {
            try {
              const httpUri = hit.account.metadataUri.startsWith("ipfs://")
                ? hit.account.metadataUri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")
                : hit.account.metadataUri;
              const resp = await fetch(httpUri, { cache: "force-cache" });
              if (resp.ok) {
                const json = (await resp.json()) as { venueTemplate?: string };
                if (json.venueTemplate) venueTemplate = json.venueTemplate;
              }
            } catch {
              // ignore
            }
          }

          event = {
            address: hit.publicKey.toBase58(),
            name: hit.account.name,
            symbol: hit.account.symbol,
            creator: hit.account.creator.toBase58(),
            merkleTree: hit.account.merkleTree.toBase58(),
            priceUsdc: Number(hit.account.price.toString()) / USDC_UNIT,
            venueTemplate,
          };

          // Resolve the template — custom layout takes priority over built-in.
          try {
            const mapping = await getEventVenueMapping(event.address);
            if (mapping) {
              const layout = await getVenueLayout(mapping.layoutId);
              if (layout) template = layoutToTemplate(layout);
            }
          } catch {
            // ignore
          }
          if (!template && venueTemplate) {
            template = getVenueTemplate(venueTemplate);
          }

          // Resolve the exact tier by matching the tier label from the cNFT name.
          const tierLabel = parseTierLabelFromName(asset.content?.metadata?.name ?? "");
          if (tierLabel) {
            const tiers = await fetchTiersForEvent(program, hit.publicKey);
            matchedTier =
              tiers.find((t) => t.name === tierLabel || t.sectionCode === tierLabel) ??
              null;
          }
        }
      } catch {
        // Program not deployed or DAS issues — render what we have.
      }

      setState({ kind: "ready", loaded: { asset, event, template, matchedTier } });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [assetId, connection, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const seat = useMemo(() => {
    if (state.kind !== "ready") return null;
    return parseSeatFromName(state.loaded.asset.content?.metadata?.name ?? "");
  }, [state]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(assetId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  if (!connected) {
    return (
      <Shell>
        <Centered>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
            Only the wallet that holds this ticket can see the full detail.
          </div>
          <WalletMultiButton />
        </Centered>
      </Shell>
    );
  }

  if (state.kind === "loading") {
    return <Shell><Centered>Loading ticket…</Centered></Shell>;
  }
  if (state.kind === "error") {
    return <Shell><Centered>Failed: {state.message}</Centered></Shell>;
  }

  const { asset, event, template, matchedTier } = state.loaded;
  const name = asset.content?.metadata?.name ?? "(unnamed)";
  const image = asset.content?.links?.image;
  const explorerUrl = `https://explorer.solana.com/address/${assetId}?cluster=devnet`;
  const ownerMatch = asset.ownership?.owner === publicKey?.toBase58();

  return (
    <Shell>
      <Link
        href="/marketplace/tickets"
        style={{ fontSize: "0.85rem", color: "#6b7280", display: "inline-block", marginBottom: "0.85rem" }}
      >
        ← My tickets
      </Link>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)",
          gap: "1.25rem",
        }}
      >
        <div
          style={{
            background: "#111",
            borderRadius: 14,
            overflow: "hidden",
            aspectRatio: "4/3",
            position: "relative",
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={toHttp(image)}
              alt={name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #8b5cf6, #6d28d9)" }} />
          )}
          {seat && (
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "rgba(79,70,229,0.95)",
                color: "#fff",
                padding: "0.45rem 0.85rem",
                borderRadius: 8,
                fontSize: "0.92rem",
                fontWeight: 700,
                letterSpacing: "0.03em",
              }}
            >
              Row {seat.rowLabel} · Seat {seat.seatNumber}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.25rem" }}>
              {name}
            </h1>
            {event && (
              <div style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                Event {event.symbol} · paid ${event.priceUsdc.toFixed(2)} · by {event.creator.slice(0, 6)}…
              </div>
            )}
          </div>

          {seat ? (
            <div
              style={{
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                borderRadius: 10,
                padding: "0.85rem 1rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#4338ca", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Your seat
              </div>
              <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#111827" }}>
                Row <strong>{seat.rowLabel}</strong> · Seat <strong>{seat.seatNumber}</strong>
                {matchedTier && (
                  <span style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: 500, marginLeft: "0.5rem" }}>
                    · {matchedTier.name} ({matchedTier.sectionCode})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "var(--shell-pill-bg, #f7f8fa)",
                border: "1px solid var(--shell-border, #eef0f3)",
                borderRadius: 10,
                padding: "0.75rem 1rem",
                fontSize: "0.85rem",
                color: "#6b7280",
              }}
            >
              General admission — no assigned seat.
            </div>
          )}

          {template && seat && (
            <VenuePreview
              template={template}
              matchedTier={matchedTier}
              seat={seat}
            />
          )}

          <div
            style={{
              border: "1px solid var(--shell-border, #eef0f3)",
              borderRadius: 10,
              padding: "0.85rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Asset ID (door scan)
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <code
                style={{
                  flex: 1,
                  fontSize: "0.72rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  background: "var(--shell-pill-bg, #f7f8fa)",
                  padding: "0.45rem 0.55rem",
                  borderRadius: 6,
                  wordBreak: "break-all",
                  color: "var(--shell-fg, #111827)",
                }}
              >
                {assetId}
              </code>
              <button
                type="button"
                onClick={() => void copyId()}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: 6,
                  border: "1px solid var(--shell-border, #eef0f3)",
                  background: "var(--shell-card, #fff)",
                  color: "var(--shell-fg, #111827)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.78rem", color: "#4338ca", fontWeight: 600, textDecoration: "none" }}
            >
              View on Solana Explorer ↗
            </a>
            {!ownerMatch && asset.ownership?.owner && (
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "#b45309",
                  background: "#fef3c7",
                  padding: "0.4rem 0.55rem",
                  borderRadius: 6,
                }}
              >
                This ticket is owned by {asset.ownership.owner.slice(0, 6)}…{asset.ownership.owner.slice(-4)}, not your connected wallet.
              </div>
            )}
          </div>

          {event && (
            <Link
              href={`/marketplace/events/v/${event.address}`}
              style={{
                padding: "0.55rem 1.1rem",
                borderRadius: 8,
                border: "1px solid var(--shell-border, #eef0f3)",
                background: "var(--shell-pill-bg, #f7f8fa)",
                color: "var(--shell-fg, #111827)",
                fontSize: "0.85rem",
                fontWeight: 600,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Back to event page →
            </Link>
          )}
        </div>
      </div>
    </Shell>
  );
}

function VenuePreview({
  template,
  matchedTier,
  seat,
}: {
  template: VenueTemplate;
  matchedTier: TicketTierDoc | null;
  seat: { rowLabel: string; seatNumber: number };
}) {
  const region = useMemo<VenueLayoutRegion | null>(() => {
    if (!matchedTier) return null;
    const r = template.regions.find((x) => x.tierRef === matchedTier.sectionCode);
    return (r as VenueLayoutRegion | undefined) ?? null;
  }, [template, matchedTier]);

  const seatDot = useMemo(() => {
    if (!region) return null;
    const labels = rowLabelsFor(region);
    const rowIdx = labels.indexOf(seat.rowLabel);
    if (rowIdx < 0) return null;
    const seats = region.seatsPerRow ?? 0;
    if (seat.seatNumber > seats) return null;

    // Derive the region's bounding box from its path `d`.
    const nums = (region.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      xs.push(nums[i]);
      ys.push(nums[i + 1]);
    }
    if (xs.length === 0) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rows = region.rows ?? labels.length;
    const colStep = (maxX - minX) / (seats + 1);
    const rowStep = (maxY - minY) / (rows + 1);
    return {
      x: minX + colStep * seat.seatNumber,
      y: minY + rowStep * (rowIdx + 1),
    };
  }, [region, seat]);

  const [vbX, vbY, vbW, vbH] = template.viewBox.split(" ").map(Number);

  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 10,
        padding: "0.75rem 0.85rem",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
        Venue map
      </div>
      <svg viewBox={template.viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {template.backgroundUrl && (
          <image
            href={template.backgroundUrl}
            x={vbX || 0}
            y={vbY || 0}
            width={vbW}
            height={vbH}
            opacity={0.5}
            preserveAspectRatio="xMidYMid meet"
            style={{ pointerEvents: "none" }}
          />
        )}
        {template.stage && (
          <path d={template.stage.d} fill="#1f2937" opacity={0.75} />
        )}
        {template.regions.map((r) => {
          const isMine = matchedTier && r.tierRef === matchedTier.sectionCode;
          const fill = (r as VenueLayoutRegion).defaultColor ?? "#9ca3af";
          return (
            <path
              key={r.tierRef}
              d={r.d}
              fill={fill}
              fillOpacity={isMine ? 0.55 : 0.12}
              stroke={isMine ? "#111827" : fill}
              strokeWidth={isMine ? 3 : 1.5}
            />
          );
        })}
        {seatDot && (
          <g>
            <circle cx={seatDot.x} cy={seatDot.y} r={14} fill="#4f46e5" fillOpacity={0.25} />
            <circle cx={seatDot.x} cy={seatDot.y} r={7} fill="#4f46e5" />
            <circle cx={seatDot.x} cy={seatDot.y} r={3} fill="#fff" />
          </g>
        )}
      </svg>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.4rem" }}>
        {region ? (
          <>
            Seat marker is an approximate location within zone{" "}
            <strong>{region.label}</strong>.
          </>
        ) : (
          <>Zone outline shown above. Exact seat position depends on venue.</>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}
