"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  buildCheckInMessage,
  CHECK_IN_CODE_VERSION,
  CHECK_IN_MAX_AGE_MS,
  formatCheckInCode,
  SignedCheckIn,
} from "@/lib/checkInSign";
import { eventTicketsProgram, fetchTiersForEvent, TicketTierDoc } from "@/lib/eventTickets";
import { getAsset, HeliusAsset } from "@/lib/helius";
import { toHttp } from "@/lib/metadataImages";
import { parseSeatFromName, parseTierLabelFromName } from "@/lib/ticketName";
import {
  buyTicketResaleTx,
  cancelTicketResaleTx,
  encodePriceEnvelope,
  fetchListingForAsset,
  generatePriceNonce,
  listTicketResalePrivateTx,
  listTicketResaleTx,
  OnChainResaleListing,
  resaleListingPda,
} from "@/lib/ticketResale";
import { getVenueTemplate, VenueTemplate } from "@/lib/venue-templates";
import {
  getEventVenueMapping,
  getVenueLayout,
  layoutToTemplate,
  rowLabelsFor,
  VenueLayoutRegion,
} from "@/lib/venueLayouts";
import { explainSolanaError } from "@/lib/solanaErrors";
import { useToast } from "@/components/ToastProvider";

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
  activeListing: OnChainResaleListing | null;
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
  const [checkInCode, setCheckInCode] = useState<{
    signed: SignedCheckIn;
    code: string;
    generatedAt: number;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [listingBusy, setListingBusy] = useState(false);
  const [lastEnvelope, setLastEnvelope] = useState<string | null>(null);
  const toast = useToast();

  // Countdown tick so the expiry label updates live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!checkInCode) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [checkInCode]);

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

      let activeListing: OnChainResaleListing | null = null;
      try {
        const treeStr = asset.compression?.tree;
        const leafId = asset.compression?.leaf_id;
        if (treeStr && leafId !== undefined && leafId !== null) {
          activeListing = await fetchListingForAsset(
            program,
            new PublicKey(treeStr),
            leafId
          );
        }
      } catch (err) {
        console.warn("listing lookup failed", err);
      }
      setState({
        kind: "ready",
        loaded: { asset, event, template, matchedTier, activeListing },
      });
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

  async function generateCheckInCode() {
    if (state.kind !== "ready" || !publicKey || !state.loaded.event) return;
    if (!wallet.signMessage) {
      setSignError("This wallet adapter does not support signing messages.");
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const payload = {
        version: CHECK_IN_CODE_VERSION,
        asset: assetId,
        event: state.loaded.event.address,
        ts: Date.now(),
        signer: publicKey.toBase58(),
      };
      const message = new TextEncoder().encode(buildCheckInMessage(payload));
      const sig = await wallet.signMessage(message);
      const signed: SignedCheckIn = { ...payload, sig: bs58.encode(sig) };
      setCheckInCode({
        signed,
        code: formatCheckInCode(signed),
        generatedAt: Date.now(),
      });
      setCodeCopied(false);
    } catch (err) {
      console.error(err);
      setSignError(err instanceof Error ? err.message : "Sign failed.");
    } finally {
      setSigning(false);
    }
  }

  async function copyCheckInCode() {
    if (!checkInCode) return;
    try {
      await navigator.clipboard.writeText(checkInCode.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  async function submitListing(input: {
    priceUsdc: number;
    expiresAt: string | null;
    isPrivate: boolean;
  }) {
    if (state.kind !== "ready" || !publicKey || !state.loaded.event) return;
    const asset = state.loaded.asset;
    const tree = asset.compression?.tree;
    if (!tree) {
      window.alert("Asset is missing compression info.");
      return;
    }
    setListingBusy(true);
    try {
      const expiresUnix = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : 0;
      let sig: string;
      if (input.isPrivate) {
        const nonce = generatePriceNonce();
        const priceBase = BigInt(Math.round(input.priceUsdc * USDC_UNIT));
        const envelope = encodePriceEnvelope(priceBase, nonce);
        sig = await listTicketResalePrivateTx({
          connection,
          wallet,
          event: new PublicKey(state.loaded.event.address),
          merkleTree: new PublicKey(tree),
          assetId,
          priceUsdc: input.priceUsdc,
          nonce,
          expiresAt: expiresUnix,
        });
        // Save envelope so the seller can copy it to share with buyer.
        setLastEnvelope(envelope);
      } else {
        sig = await listTicketResaleTx({
          connection,
          wallet,
          event: new PublicKey(state.loaded.event.address),
          merkleTree: new PublicKey(tree),
          assetId,
          priceUsdc: input.priceUsdc,
          expiresAt: expiresUnix,
        });
        setLastEnvelope(null);
      }
      setListingOpen(false);
      console.log("List tx:", sig);
      toast.success("Listed");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setListingBusy(false);
    }
  }

  async function cancelCurrentListing() {
    if (state.kind !== "ready" || !publicKey) return;
    const listing = state.loaded.activeListing;
    if (!listing) return;
    if (!window.confirm("Cancel this resale listing? The cNFT will be transferred back to your wallet.")) return;
    setListingBusy(true);
    try {
      const sig = await cancelTicketResaleTx({
        connection,
        wallet,
        listing,
        assetId,
      });
      console.log("Cancel tx:", sig);
      toast.success("Cancelled");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setListingBusy(false);
    }
  }

  if (!connected) {
    return (
      <Shell>
        <Centered>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
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
  const me = publicKey?.toBase58();
  const directOwner = asset.ownership?.owner === me;
  const listingSellerIsMe = state.loaded.activeListing?.seller === me;
  // Holder == direct cNFT owner OR this wallet listed the ticket (it's
  // currently custodied by the listing PDA).
  const ownerMatch = !!me && (directOwner || listingSellerIsMe);

  return (
    <Shell>
      <Link
        href="/marketplace/tickets"
        style={{ fontSize: "0.85rem", color: "var(--shell-muted)", display: "inline-block", marginBottom: "0.85rem" }}
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
            <h1 style={{ fontSize: "1.55rem", letterSpacing: 0, fontWeight: 600, marginBottom: "0.25rem" }}>
              {name}
            </h1>
            {event && (
              <div style={{ fontSize: "0.9rem", color: "var(--shell-muted)" }}>
                Event {event.symbol} · paid ${event.priceUsdc.toFixed(2)} · by {event.creator.slice(0, 6)}…
              </div>
            )}
          </div>

          {seat ? (
            <div
              style={{
                background: "var(--shell-active-bg)",
                border: "1px solid #c7d2fe",
                borderRadius: 10,
                padding: "0.85rem 1rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "var(--shell-link)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                Your seat
              </div>
              <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--shell-fg)" }}>
                Row <strong>{seat.rowLabel}</strong> · Seat <strong>{seat.seatNumber}</strong>
                {matchedTier && (
                  <span style={{ fontSize: "0.85rem", color: "var(--shell-muted)", fontWeight: 500, marginLeft: "0.5rem" }}>
                    · {matchedTier.name} ({matchedTier.sectionCode})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "var(--shell-pill-bg, #f7f8fa)",
                border: "1px solid var(--shell-border, var(--shell-border))",
                borderRadius: 10,
                padding: "0.75rem 1rem",
                fontSize: "0.85rem",
                color: "var(--shell-muted)",
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

          {ownerMatch && event && (
            <ResalePanel
              listing={state.loaded.activeListing}
              open={listingOpen}
              busy={listingBusy}
              envelope={lastEnvelope}
              onDismissEnvelope={() => setLastEnvelope(null)}
              onOpen={() => setListingOpen(true)}
              onClose={() => {
                if (!listingBusy) setListingOpen(false);
              }}
              onSubmit={(v) => void submitListing(v)}
              onCancel={() => void cancelCurrentListing()}
            />
          )}

          {ownerMatch && event && (
            <div
              style={{
                border: "1px solid #c7d2fe",
                background: "var(--shell-active-bg)",
                borderRadius: 10,
                padding: "0.85rem 1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "var(--shell-link)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Check-in code
              </div>
              <div style={{ fontSize: "0.78rem", color: "#3730a3" }}>
                Door staff scans the QR or types the code at the gate. Generate
                it on this device — it stays valid for 5 minutes, then regenerate
                if needed.
              </div>
              {checkInCode ? (
                <CheckInCodeDisplay
                  code={checkInCode.code}
                  generatedAt={checkInCode.generatedAt}
                  now={now}
                  copied={codeCopied}
                  onCopy={() => void copyCheckInCode()}
                  onRegenerate={() => void generateCheckInCode()}
                  regenerating={signing}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => void generateCheckInCode()}
                  disabled={signing}
                  style={{
                    padding: "0.55rem 1.1rem",
                    borderRadius: 8,
                    border: "none",
                    background: signing ? "#c7d2fe" : "#4f46e5",
                    color: "#fff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: signing ? "not-allowed" : "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  {signing ? "Signing…" : "Generate check-in code"}
                </button>
              )}
              {signError && (
                <div style={{ fontSize: "0.75rem", color: "#b91c1c" }}>{signError}</div>
              )}
            </div>
          )}

          <div
            style={{
              border: "1px solid var(--shell-border, var(--shell-border))",
              borderRadius: 10,
              padding: "0.85rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Asset ID (unverified fallback)
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
                  border: "1px solid var(--shell-border, var(--shell-border))",
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
              style={{ fontSize: "0.78rem", color: "var(--shell-link)", fontWeight: 600, textDecoration: "none" }}
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
                border: "1px solid var(--shell-border, var(--shell-border))",
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

function ResalePanel({
  listing,
  open,
  busy,
  envelope,
  onDismissEnvelope,
  onOpen,
  onClose,
  onSubmit,
  onCancel,
}: {
  listing: OnChainResaleListing | null;
  open: boolean;
  busy: boolean;
  envelope: string | null;
  onDismissEnvelope: () => void;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (v: { priceUsdc: number; expiresAt: string | null; isPrivate: boolean }) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [expiry, setExpiry] = useState<"1d" | "3d" | "1w" | "none">("1w");
  const [isPrivate, setIsPrivate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [envelopeCopied, setEnvelopeCopied] = useState(false);

  function expiresToIso(v: typeof expiry): string | null {
    if (v === "none") return null;
    const d = new Date();
    if (v === "1d") d.setDate(d.getDate() + 1);
    else if (v === "3d") d.setDate(d.getDate() + 3);
    else if (v === "1w") d.setDate(d.getDate() + 7);
    return d.toISOString();
  }

  function handleSubmit() {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p <= 0) {
      setErr("Price must be a positive number.");
      return;
    }
    setErr(null);
    onSubmit({
      priceUsdc: p,
      expiresAt: expiresToIso(expiry),
      isPrivate,
    });
  }

  if (listing) {
    const priceUsdc = listing.priceUsdc;
    const expiresMs = listing.expiresAt * 1000;
    return (
      <div
        style={{
          border: "1px solid #10b981",
          background: "#ecfdf5",
          borderRadius: 10,
          padding: "0.85rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.55rem",
        }}
      >
        <div style={{ fontSize: "0.72rem", color: "#065f46", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Listed for resale · on-chain escrow {listing.isPrivate ? "· PRIVATE PRICE" : ""}
        </div>
        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#065f46" }}>
          {listing.isPrivate ? "Price hidden on-chain" : `$${priceUsdc.toFixed(2)} USDC`}
        </div>
        {listing.isPrivate && (
          <div style={{ fontSize: "0.72rem", color: "#065f46", lineHeight: 1.4 }}>
            The cNFT is in escrow. Only someone with the (price, nonce) envelope
            you generated can buy — share it over DM / email / encrypted chat.
          </div>
        )}
        {envelope && (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #10b981",
              borderRadius: 8,
              padding: "0.6rem 0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "#065f46", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Share this envelope (one-time)
            </div>
            <code
              style={{
                fontSize: "0.72rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: "#f0fdf4",
                padding: "0.4rem 0.5rem",
                borderRadius: 6,
                wordBreak: "break-all",
                color: "#064e3b",
              }}
            >
              {envelope}
            </code>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(envelope);
                    setEnvelopeCopied(true);
                    setTimeout(() => setEnvelopeCopied(false), 1600);
                  } catch {
                    // ignore
                  }
                }}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: 6,
                  border: "none",
                  background: "#10b981",
                  color: "#fff",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {envelopeCopied ? "✓ Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={onDismissEnvelope}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: 6,
                  border: "1px solid #a7f3d0",
                  background: "transparent",
                  color: "#065f46",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                I saved it
              </button>
            </div>
            <div style={{ fontSize: "0.68rem", color: "#b91c1c" }}>
              This is shown only once. If you lose the envelope and haven&apos;t
              sent it to a buyer, cancel the listing to recover the cNFT.
            </div>
          </div>
        )}
        {expiresMs > 0 && (
          <div style={{ fontSize: "0.78rem", color: "#047857" }}>
            Expires {new Date(expiresMs).toLocaleString()}
          </div>
        )}
        <div style={{ fontSize: "0.72rem", color: "#065f46" }}>
          cNFT is held by the listing PDA until someone buys or you cancel.
          Buy swaps USDC + cNFT atomically in one transaction — no trust gap.
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            alignSelf: "flex-start",
            padding: "0.4rem 0.85rem",
            borderRadius: 7,
            border: "1px solid #fecaca",
            background: "transparent",
            color: "#b91c1c",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Cancelling…" : "Cancel listing · return cNFT"}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div
        style={{
          border: "1px solid var(--shell-border, var(--shell-border))",
          borderRadius: 10,
          padding: "0.85rem 1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Resell this ticket</div>
          <div style={{ fontSize: "0.76rem", color: "var(--shell-muted)" }}>
            cNFT goes into on-chain escrow; buyer pays in atomic swap.
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, var(--shell-border))",
            background: "var(--shell-pill-bg, #f7f8fa)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          List for resale
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--shell-border, var(--shell-border))",
        borderRadius: 10,
        padding: "0.85rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
      }}
    >
      <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.2rem" }}>
        List this ticket for resale
      </div>
      <div
        style={{
          fontSize: "0.72rem",
          background: "var(--shell-active-bg)",
          color: "#3730a3",
          padding: "0.45rem 0.6rem",
          borderRadius: 7,
        }}
      >
        Publishing transfers the cNFT into a program-controlled PDA (on-chain
        escrow) in the same transaction as the listing is created. Buyers hit
        one atomic ix that swaps USDC + cNFT. You can cancel anytime — the
        cNFT comes straight back to your wallet.
      </div>

      <label style={smallLabel}>Price (USDC)</label>
      <input
        type="number"
        min={0.01}
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="e.g. 85"
        style={smallInput}
      />

      <label style={smallLabel}>Active for</label>
      <select
        value={expiry}
        onChange={(e) => setExpiry(e.target.value as "1d" | "3d" | "1w" | "none")}
        style={smallInput}
      >
        <option value="1d">1 day</option>
        <option value="3d">3 days</option>
        <option value="1w">1 week</option>
        <option value="none">No expiry</option>
      </select>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.45rem",
          fontSize: "0.8rem",
          color: "var(--shell-fg, #111827)",
          marginTop: "0.2rem",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Private price</strong> — commit price off-chain (keccak256 hash),
          share envelope only with the buyer. Useful for pre-negotiated sales
          (corporate blocks, invite-only drops). Buy tx still reveals price
          on-chain at settlement.
        </span>
      </label>

      {err && <div style={{ fontSize: "0.75rem", color: "#b91c1c" }}>{err}</div>}

      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          style={{
            padding: "0.45rem 1rem",
            borderRadius: 7,
            border: "none",
            background: busy ? "#c7d2fe" : "#4f46e5",
            color: "#fff",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Listing…" : "Publish listing"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            padding: "0.45rem 0.95rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, var(--shell-border))",
            background: "transparent",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const smallLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--shell-muted)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const smallInput: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: 6,
  border: "1px solid var(--shell-border, var(--shell-border))",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.85rem",
};

function CheckInCodeDisplay({
  code,
  generatedAt,
  now,
  copied,
  onCopy,
  onRegenerate,
  regenerating,
}: {
  code: string;
  generatedAt: number;
  now: number;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const remainingMs = Math.max(0, generatedAt + CHECK_IN_MAX_AGE_MS - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const expired = remainingMs === 0;
  const remainingLabel = expired
    ? "Expired — regenerate"
    : `Valid for ${Math.floor(remainingSec / 60)}:${(remainingSec % 60).toString().padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      {!expired && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #c7d2fe",
            borderRadius: 8,
            padding: "0.75rem",
            alignSelf: "center",
            display: "inline-block",
          }}
        >
          <QRCodeSVG
            value={code}
            size={200}
            level="M"
            includeMargin={false}
            style={{ display: "block" }}
          />
        </div>
      )}
      <details>
        <summary
          style={{
            fontSize: "0.72rem",
            color: "var(--shell-link)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Show raw code (for copy-paste)
        </summary>
        <div
          style={{
            background: "#fff",
            border: "1px solid #c7d2fe",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.7rem",
            wordBreak: "break-all",
            color: "#1e1b4b",
            marginTop: "0.3rem",
          }}
        >
          {code}
        </div>
      </details>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCopy}
          disabled={expired}
          style={{
            padding: "0.4rem 0.85rem",
            borderRadius: 7,
            border: "none",
            background: expired ? "#c7d2fe" : "#4f46e5",
            color: "#fff",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: expired ? "not-allowed" : "pointer",
          }}
        >
          {copied ? "✓ Copied" : "Copy code"}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          style={{
            padding: "0.4rem 0.85rem",
            borderRadius: 7,
            border: "1px solid #c7d2fe",
            background: "transparent",
            color: "var(--shell-link)",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: regenerating ? "not-allowed" : "pointer",
          }}
        >
          {regenerating ? "Signing…" : "Regenerate"}
        </button>
        <span
          style={{
            fontSize: "0.72rem",
            color: expired ? "#b91c1c" : "var(--shell-link)",
            fontWeight: 600,
          }}
        >
          {remainingLabel}
        </span>
      </div>
    </div>
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
        border: "1px solid var(--shell-border, var(--shell-border))",
        borderRadius: 10,
        padding: "0.75rem 0.85rem",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
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
          const fill = (r as VenueLayoutRegion).defaultColor ?? "var(--shell-faint)";
          return (
            <path
              key={r.tierRef}
              d={r.d}
              fill={fill}
              fillOpacity={isMine ? 0.55 : 0.12}
              stroke={isMine ? "var(--shell-fg)" : fill}
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
      <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", marginTop: "0.4rem" }}>
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
        border: "1px solid var(--shell-border, var(--shell-border))",
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
