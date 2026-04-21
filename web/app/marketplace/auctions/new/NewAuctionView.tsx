"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LocationPicker, LocationValue } from "@/components/LocationPicker";
import { createAuctionTx } from "@/lib/auctions";
import { uploadAuctionMetadata } from "@/lib/auctionMetadata";

export function NewAuctionView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();

  const [memo, setMemo] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [startPrice, setStartPrice] = useState("10");
  const [minDeposit, setMinDeposit] = useState("1");
  const [commitHours, setCommitHours] = useState("24");
  const [revealHours, setRevealHours] = useState("24");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey) return;

    const startP = parseFloat(startPrice);
    const minD = parseFloat(minDeposit);
    const commitH = parseFloat(commitHours);
    const revealH = parseFloat(revealHours);

    if (!Number.isFinite(startP) || startP < 0) {
      window.alert("Start price must be ≥ 0 USDC.");
      return;
    }
    if (!Number.isFinite(minD) || minD <= 0) {
      window.alert("Minimum deposit must be > 0 USDC.");
      return;
    }
    if (!Number.isFinite(commitH) || commitH < 0.01) {
      window.alert("Commit window too short.");
      return;
    }
    if (!Number.isFinite(revealH) || revealH < 0.01) {
      window.alert("Reveal window too short.");
      return;
    }
    if (!memo.trim()) {
      window.alert("Memo (short description) is required.");
      return;
    }

    setBusy(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const commitEndsAt = now + Math.round(commitH * 3600);
      const revealEndsAt = commitEndsAt + Math.round(revealH * 3600);
      const auctionId = BigInt(now); // matches lib/auctions createAuctionTx seed

      // Upload enriched metadata JSON first if the user filled anything
      // beyond the memo. We pick up auctionId client-side from the same
      // seed createAuctionTx uses so the metadata file is keyed cleanly.
      let metadataUri = "";
      const hasEnriched =
        description.trim() || videoUrl.trim() || location !== null;
      if (hasEnriched && publicKey) {
        metadataUri = await uploadAuctionMetadata(publicKey.toBase58(), auctionId, {
          memo: memo.trim(),
          description: description.trim() || undefined,
          videoUrl: videoUrl.trim() || undefined,
          location: location ?? undefined,
          createdAt: new Date().toISOString(),
        });
      }

      // `createAuctionTx` derives auctionId = floor(Date.now()/1000) itself.
      // We compute it the same way above so the metadata filename matches,
      // but we pass metadataUri derived from our own upload.
      const { sig, auctionAddress } = await createAuctionTx({
        connection,
        wallet,
        startPriceUsdc: startP,
        minDepositUsdc: minD,
        commitEndsAt,
        revealEndsAt,
        memo: memo.trim().slice(0, 140),
        metadataUri: metadataUri.slice(0, 256),
      });
      window.alert(`Auction created. Tx: ${sig.slice(0, 12)}…`);
      router.push(`/marketplace/auctions/${auctionAddress}`);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Shell>
        <Centered>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
          <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
            Connect a wallet to create auctions.
          </div>
          <WalletMultiButton />
        </Centered>
      </Shell>
    );
  }

  return (
    <Shell>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.45rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
          Create auction
        </h1>
        <Link href="/marketplace/auctions" style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none" }}>
          ← All auctions
        </Link>
      </header>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <Field label="Memo (short description — max 140 chars)">
          <input
            type="text"
            value={memo}
            maxLength={140}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Apartment 12A rental · May 1-15 · 2 beds · Savamala"
            style={inputStyle}
            required
          />
        </Field>

        <Field label="Long description (optional)">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Full specs, rental window, house rules, rental terms, etc."
            style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
          />
        </Field>

        <Field label="Video URL (optional — YouTube, Vimeo, direct MP4)">
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/… or https://…/walkthrough.mp4"
            style={inputStyle}
          />
        </Field>

        <Field label="Location (optional — address, map pin, plot boundary)">
          <LocationPicker value={location} onChange={setLocation} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="Start price (USDC)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={startPrice}
              onChange={(e) => setStartPrice(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Min deposit per bidder (USDC)">
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={minDeposit}
              onChange={(e) => setMinDeposit(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="Commit window (hours)">
            <input
              type="number"
              min={0.01}
              step="0.5"
              value={commitHours}
              onChange={(e) => setCommitHours(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Reveal window (hours)">
            <input
              type="number"
              min={0.01}
              step="0.5"
              value={revealHours}
              onChange={(e) => setRevealHours(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div
          style={{
            background: "#eef2ff",
            color: "#3730a3",
            padding: "0.65rem 0.85rem",
            borderRadius: 8,
            fontSize: "0.78rem",
          }}
        >
          Bidders commit <code>keccak256(bid || nonce)</code> + escrow during
          the commit window. After the deadline they reveal the plain bid;
          the highest revealed bid wins. Losers pull their escrow back via
          refund_bid after settle.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Link
            href="/marketplace/auctions"
            style={{
              padding: "0.55rem 1rem",
              borderRadius: 8,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: "var(--shell-card, #fff)",
              color: "var(--shell-fg, #111827)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "0.55rem 1.2rem",
              borderRadius: 8,
              border: "none",
              background: busy ? "#c7d2fe" : "#4f46e5",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Creating…" : "Create auction"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#6b7280", background: "var(--shell-card, #fff)", border: "1px solid var(--shell-border, #eef0f3)", borderRadius: 12 }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.55rem 0.7rem",
  borderRadius: 7,
  border: "1px solid var(--shell-border, #eef0f3)",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.9rem",
};
