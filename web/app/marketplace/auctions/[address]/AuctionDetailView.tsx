"use client";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LocationView } from "@/components/LocationView";
import {
  auctionsProgram,
  cacheBidEnvelope,
  cancelAuctionTx,
  clearCachedBidEnvelope,
  commitBidTx,
  decodeBidEnvelope,
  encodeBidEnvelope,
  fetchAuction,
  fetchBidsForAuction,
  fetchMyBid,
  generateBidNonce,
  OnChainAuction,
  OnChainSealedBid,
  readCachedBidEnvelope,
  refundBidTx,
  revealBidTx,
  settleAuctionTx,
} from "@/lib/auctions";
import { AuctionMetadata, fetchAuctionMetadata } from "@/lib/auctionMetadata";
import { isChatAllowed } from "@/lib/supabase";
import { ContactSellerButton } from "@/components/ContactSellerButton";
import { VideoEmbed } from "@/components/VideoEmbed";
import { USDC_UNIT } from "@/lib/constants";

type Loaded = {
  auction: OnChainAuction;
  bids: OnChainSealedBid[];
  myBid: OnChainSealedBid | null;
  metadata: AuctionMetadata | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; loaded: Loaded }
  | { kind: "error"; message: string };

function phaseOf(a: OnChainAuction, now: number): "commit" | "reveal" | "settle-ready" | "terminal" {
  if (a.status === "settled" || a.status === "cancelled") return "terminal";
  if (now < a.commitEndsAt) return "commit";
  if (now < a.revealEndsAt) return "reveal";
  return "settle-ready";
}

export function AuctionDetailView({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [lastEnvelope, setLastEnvelope] = useState<string | null>(null);
  const [envelopeInput, setEnvelopeInput] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = auctionsProgram(provider);
      const auctionPk = new PublicKey(address);
      const auction = await fetchAuction(program, auctionPk);
      if (!auction) {
        setState({ kind: "error", message: "Auction not found." });
        return;
      }
      const bids = await fetchBidsForAuction(program, auctionPk);
      const myBid = publicKey
        ? await fetchMyBid(program, auctionPk, publicKey)
        : null;
      const metadata = auction.metadataUri
        ? await fetchAuctionMetadata(auction.metadataUri)
        : null;
      setState({ kind: "ready", loaded: { auction, bids, myBid, metadata } });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: err instanceof Error ? err.message : "Load failed" });
    }
  }, [address, connection, wallet, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function placeBid(bidUsdc: number, escrowUsdc: number) {
    if (!publicKey || state.kind !== "ready") return;
    const auction = state.loaded.auction;
    setBusy(true);
    try {
      const bidBase = BigInt(Math.round(bidUsdc * USDC_UNIT));
      const escrowBase = BigInt(Math.round(escrowUsdc * USDC_UNIT));
      if (escrowBase < auction.minDepositBase) throw new Error("Escrow below min deposit");
      if (bidBase > escrowBase) throw new Error("Bid cannot exceed escrow");
      const nonce = generateBidNonce();

      const sig = await commitBidTx({
        connection,
        wallet,
        auction,
        bidBase,
        nonce,
        escrowBase,
      });
      const envelope = encodeBidEnvelope(bidBase, nonce);
      cacheBidEnvelope(auction.address, publicKey.toBase58(), envelope);
      setLastEnvelope(envelope);
      window.alert(`Bid committed. Save the envelope — you'll need it to reveal. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(envelope: string) {
    if (!publicKey || state.kind !== "ready") return;
    const auction = state.loaded.auction;
    const decoded = decodeBidEnvelope(envelope.trim());
    if (!decoded) {
      window.alert("Envelope doesn't decode.");
      return;
    }
    setBusy(true);
    try {
      const sig = await revealBidTx({
        connection,
        wallet,
        auction,
        bidBase: decoded.bidBase,
        nonce: decoded.nonce,
      });
      const bidUsdc = Number(decoded.bidBase) / USDC_UNIT;
      window.alert(`Revealed $${bidUsdc.toFixed(2)}. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Reveal failed");
    } finally {
      setBusy(false);
    }
  }

  async function settle() {
    if (state.kind !== "ready") return;
    setBusy(true);
    try {
      const sig = await settleAuctionTx({
        connection,
        wallet,
        auction: state.loaded.auction,
      });
      window.alert(`Settled. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Settle failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (state.kind !== "ready") return;
    if (!window.confirm("Cancel the auction? This only works if no bids have been committed.")) return;
    setBusy(true);
    try {
      const sig = await cancelAuctionTx({
        connection,
        wallet,
        auction: state.loaded.auction,
      });
      window.alert(`Cancelled. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!publicKey || state.kind !== "ready") return;
    setBusy(true);
    try {
      const sig = await refundBidTx({
        connection,
        wallet,
        auction: state.loaded.auction,
      });
      clearCachedBidEnvelope(state.loaded.auction.address, publicKey.toBase58());
      setLastEnvelope(null);
      window.alert(`Refunded. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  const cachedEnvelope = useMemo(() => {
    if (!publicKey || state.kind !== "ready") return null;
    return readCachedBidEnvelope(state.loaded.auction.address, publicKey.toBase58());
  }, [publicKey, state]);

  if (!connected) {
    return (
      <Shell title="Auction">
        <Centered>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
            Browse or bid requires a connected wallet.
          </div>
          <WalletMultiButton />
        </Centered>
      </Shell>
    );
  }

  if (state.kind === "loading") {
    return <Shell title="Auction"><Centered>Loading…</Centered></Shell>;
  }
  if (state.kind === "error") {
    return <Shell title="Auction"><Centered>{state.message}</Centered></Shell>;
  }

  const { auction, bids, myBid } = state.loaded;
  const phase = phaseOf(auction, now);
  const me = publicKey?.toBase58() ?? null;
  const isSeller = me === auction.seller;

  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <Link href="/marketplace/auctions" style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none" }}>
          ← All auctions
        </Link>
        <h1 style={{ fontSize: "1.45rem", fontWeight: 600, letterSpacing: "-0.02em", marginTop: "0.35rem", marginBottom: "0.3rem" }}>
          {auction.memo || "(no memo)"}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
            Seller {auction.seller.slice(0, 6)}…{auction.seller.slice(-4)} · id {auction.auctionId}
          </div>
          <ContactSellerButton
            listingKind="auction"
            listingPda={address}
            sellerPubkey={auction.seller}
            allowChat={isChatAllowed(state.loaded.metadata)}
          />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1rem" }}>
        <Card>
          <SectionTitle>Phase</SectionTitle>
          <PhaseDisplay phase={phase} auction={auction} now={now} />
        </Card>
        <Card>
          <SectionTitle>Numbers</SectionTitle>
          <div style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem" }}>
            <KV k="Floor" v={`$${auction.startPriceUsdc.toFixed(2)}`} />
            <KV k="Min deposit" v={`$${auction.minDepositUsdc.toFixed(2)}`} />
            <KV k="Bids committed" v={auction.bidCount.toString()} />
            <KV k="Bids revealed" v={auction.revealedCount.toString()} />
            {auction.highestBidUsdc > 0 && (
              <KV k="Highest revealed" v={`$${auction.highestBidUsdc.toFixed(2)}`} />
            )}
            {auction.status === "settled" && (
              <KV k="Winner" v={`${auction.highestBidder.slice(0, 6)}…${auction.highestBidder.slice(-4)}`} />
            )}
          </div>
        </Card>
      </div>

      {state.loaded.metadata?.gallery && state.loaded.metadata.gallery.length > 0 && (
        <Card>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {state.loaded.metadata.gallery.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        </Card>
      )}

      {state.loaded.metadata?.description && (
        <Card>
          <SectionTitle>Description</SectionTitle>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-fg, #111827)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {state.loaded.metadata.description}
          </div>
        </Card>
      )}

      {state.loaded.metadata?.location && (
        <Card>
          <SectionTitle>Location</SectionTitle>
          <LocationView location={state.loaded.metadata.location} />
        </Card>
      )}

      {state.loaded.metadata?.videoUrl && (
        <Card>
          <SectionTitle>Video</SectionTitle>
          <VideoEmbed url={state.loaded.metadata.videoUrl} />
        </Card>
      )}

      {auction.metadataUri && (
        <Card>
          <SectionTitle>Raw metadata</SectionTitle>
          <a
            href={auction.metadataUri}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.76rem", color: "#6b7280", textDecoration: "none", wordBreak: "break-all" }}
          >
            {auction.metadataUri} ↗
          </a>
        </Card>
      )}

      {isSeller && phase === "commit" && auction.bidCount === 0 && (
        <Card>
          <button type="button" onClick={() => void cancel()} disabled={busy} style={dangerBtn(busy)}>
            {busy ? "…" : "Cancel auction"}
          </button>
        </Card>
      )}

      {!isSeller && phase === "commit" && !myBid && (
        <Card>
          <SectionTitle>Place a sealed bid</SectionTitle>
          <BidForm
            startPriceUsdc={auction.startPriceUsdc}
            minDepositUsdc={auction.minDepositUsdc}
            busy={busy}
            onSubmit={placeBid}
          />
        </Card>
      )}

      {myBid && myBid.status === "committed" && phase === "reveal" && (
        <Card>
          <SectionTitle>Reveal your bid</SectionTitle>
          <RevealForm
            cachedEnvelope={cachedEnvelope}
            value={envelopeInput}
            onChange={setEnvelopeInput}
            busy={busy}
            onReveal={reveal}
          />
        </Card>
      )}

      {phase === "settle-ready" && auction.status !== "settled" && auction.status !== "cancelled" && auction.revealedCount > 0 && (
        <Card>
          <SectionTitle>Settle</SectionTitle>
          <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.5rem" }}>
            Reveal window closed. Anyone can settle — pays the winning bid to the
            seller (minus platform fee), marks the winner, and unlocks refunds
            for other bidders.
          </div>
          <button type="button" onClick={() => void settle()} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "Settling…" : "Settle auction"}
          </button>
        </Card>
      )}

      {auction.status === "settled" && myBid && myBid.status === "revealed" && myBid.bidder !== auction.highestBidder && (
        <Card>
          <SectionTitle>Claim refund</SectionTitle>
          <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.5rem" }}>
            You didn&apos;t win — pull your escrow back.
          </div>
          <button type="button" onClick={() => void refund()} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "Refunding…" : `Refund $${myBid.escrowUsdc.toFixed(2)}`}
          </button>
        </Card>
      )}

      {auction.status === "cancelled" && myBid && myBid.status !== "refunded" && (
        <Card>
          <SectionTitle>Claim refund</SectionTitle>
          <button type="button" onClick={() => void refund()} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "Refunding…" : `Refund $${myBid.escrowUsdc.toFixed(2)}`}
          </button>
        </Card>
      )}

      {lastEnvelope && (
        <Card>
          <SectionTitle>Save your envelope</SectionTitle>
          <div style={{ fontSize: "0.78rem", color: "#b91c1c", marginBottom: "0.5rem" }}>
            You need this to reveal. It&apos;s also cached in this browser, but
            copy it to a safe place in case you switch devices.
          </div>
          <code
            style={{
              display: "block",
              background: "#f3f4f6",
              padding: "0.55rem 0.7rem",
              borderRadius: 8,
              fontSize: "0.72rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              wordBreak: "break-all",
              marginBottom: "0.45rem",
            }}
          >
            {lastEnvelope}
          </code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lastEnvelope);
              } catch {
                // ignore
              }
            }}
            style={primaryBtn(false)}
          >
            Copy envelope
          </button>
        </Card>
      )}

      <Card>
        <SectionTitle>All bids ({bids.length})</SectionTitle>
        {bids.length === 0 ? (
          <Centered>No bids committed yet.</Centered>
        ) : (
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {bids.map((b) => (
              <BidRow key={b.address} bid={b} auction={auction} me={me} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function PhaseDisplay({
  phase,
  auction,
  now,
}: {
  phase: "commit" | "reveal" | "settle-ready" | "terminal";
  auction: OnChainAuction;
  now: number;
}) {
  if (phase === "terminal") {
    return (
      <div style={{ fontSize: "0.9rem", color: auction.status === "settled" ? "#065f46" : "#6b7280", fontWeight: 600 }}>
        {auction.status === "settled" ? "Settled" : "Cancelled"}
      </div>
    );
  }
  const endsAt =
    phase === "commit"
      ? auction.commitEndsAt
      : phase === "reveal"
      ? auction.revealEndsAt
      : now;
  const secs = Math.max(0, endsAt - now);
  const label =
    phase === "commit" ? "Commit open" : phase === "reveal" ? "Reveal open" : "Ready to settle";
  return (
    <div>
      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#3730a3" }}>{label}</div>
      {phase !== "settle-ready" && (
        <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.3rem" }}>
          Ends in {formatDur(secs)} · {new Date(endsAt * 1000).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function BidForm({
  startPriceUsdc,
  minDepositUsdc,
  busy,
  onSubmit,
}: {
  startPriceUsdc: number;
  minDepositUsdc: number;
  busy: boolean;
  onSubmit: (bidUsdc: number, escrowUsdc: number) => void;
}) {
  const [bid, setBid] = useState("");
  const [escrow, setEscrow] = useState(minDepositUsdc.toFixed(2));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const b = parseFloat(bid);
        const es = parseFloat(escrow);
        if (!Number.isFinite(b) || b < startPriceUsdc) {
          window.alert(`Bid must be ≥ $${startPriceUsdc.toFixed(2)} (floor).`);
          return;
        }
        if (!Number.isFinite(es) || es < minDepositUsdc || es < b) {
          window.alert(`Escrow must be ≥ max(min_deposit $${minDepositUsdc.toFixed(2)}, bid $${b.toFixed(2)}).`);
          return;
        }
        onSubmit(b, es);
      }}
      style={{ display: "grid", gap: "0.5rem" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Your bid (USDC)">
          <input
            type="number"
            min={startPriceUsdc}
            step="0.01"
            value={bid}
            onChange={(e) => setBid(e.target.value)}
            placeholder={`≥ ${startPriceUsdc.toFixed(2)}`}
            style={inputStyle}
            required
          />
        </Field>
        <Field label="Escrow to lock (USDC)">
          <input
            type="number"
            min={minDepositUsdc}
            step="0.01"
            value={escrow}
            onChange={(e) => setEscrow(e.target.value)}
            style={inputStyle}
            required
          />
        </Field>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
        Escrow can be higher than the bid — the extra is a privacy pad (you
        get it all back if you lose). Minimum per auction is{" "}
        <strong>${minDepositUsdc.toFixed(2)}</strong>.
      </div>
      <button type="submit" disabled={busy} style={primaryBtn(busy)}>
        {busy ? "Committing…" : "Commit sealed bid"}
      </button>
    </form>
  );
}

function RevealForm({
  cachedEnvelope,
  value,
  onChange,
  busy,
  onReveal,
}: {
  cachedEnvelope: string | null;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  onReveal: (envelope: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {cachedEnvelope && (
        <div
          style={{
            background: "#eef2ff",
            color: "#3730a3",
            padding: "0.55rem 0.75rem",
            borderRadius: 8,
            fontSize: "0.82rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>Envelope cached in this browser. One click to reveal.</span>
          <button type="button" onClick={() => onReveal(cachedEnvelope)} disabled={busy} style={primaryBtn(busy)}>
            {busy ? "…" : "Reveal cached"}
          </button>
        </div>
      )}
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or paste the envelope manually"
        style={{
          ...inputStyle,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          resize: "vertical",
          minHeight: 72,
        }}
      />
      <button
        type="button"
        onClick={() => onReveal(value)}
        disabled={busy || !value.trim()}
        style={primaryBtn(busy || !value.trim())}
      >
        {busy ? "Revealing…" : "Reveal bid"}
      </button>
    </div>
  );
}

function BidRow({
  bid,
  auction,
  me,
}: {
  bid: OnChainSealedBid;
  auction: OnChainAuction;
  me: string | null;
}) {
  const isWinner =
    auction.status === "settled" && bid.bidder === auction.highestBidder;
  const isMe = bid.bidder === me;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.55rem 0.7rem",
        border: `1px solid ${isWinner ? "#10b981" : "var(--shell-border, #eef0f3)"}`,
        background: isWinner ? "#ecfdf5" : "var(--shell-card, #fff)",
        borderRadius: 7,
      }}
    >
      <code style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
        {bid.bidder.slice(0, 6)}…{bid.bidder.slice(-4)}
      </code>
      <div style={{ fontSize: "0.78rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill status={bid.status} />
        {isMe && <span style={{ color: "#4338ca", fontWeight: 600 }}>you</span>}
        {isWinner && <span style={{ color: "#065f46", fontWeight: 700 }}>WINNER</span>}
        <span>Escrow ${bid.escrowUsdc.toFixed(2)}</span>
        {bid.status === "revealed" || bid.status === "won" ? (
          <span>Bid <strong>${bid.revealedBidUsdc.toFixed(2)}</strong></span>
        ) : (
          <span style={{ color: "#9ca3af" }}>bid sealed</span>
        )}
      </div>
      <div style={{ fontSize: "0.7rem", color: "#6b7280", whiteSpace: "nowrap" }}>
        {new Date(bid.committedAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: OnChainSealedBid["status"] }) {
  const palette: Record<OnChainSealedBid["status"], { bg: string; fg: string }> = {
    committed: { bg: "#eef2ff", fg: "#3730a3" },
    revealed: { bg: "#fef3c7", fg: "#92400e" },
    won: { bg: "#dcfce7", fg: "#166534" },
    refunded: { bg: "#f3f4f6", fg: "#4b5563" },
  };
  const c = palette[status];
  return (
    <span
      style={{
        fontSize: "0.62rem",
        padding: "0.1rem 0.4rem",
        borderRadius: 4,
        background: c.bg,
        color: c.fg,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function formatDur(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.45rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</h1>
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
        padding: "1rem 1.15rem",
        marginBottom: "0.85rem",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.55rem" }}>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <span style={{ fontSize: "0.68rem", color: "#6b7280", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "0.45rem" }}>
      <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 1.05rem",
    borderRadius: 7,
    border: "none",
    background: disabled ? "#c7d2fe" : "#4f46e5",
    color: "#fff",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function dangerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 1.05rem",
    borderRadius: 7,
    border: "1px solid #fecaca",
    background: "transparent",
    color: "#b91c1c",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: 7,
  border: "1px solid var(--shell-border, #eef0f3)",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.88rem",
};
