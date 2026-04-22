"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GalleryUploader } from "@/components/GalleryUploader";
import { LocationPicker, LocationValue } from "@/components/LocationPicker";
import { USDC_UNIT, getUsdcMint } from "@/lib/constants";
import { uploadRentalMetadata } from "@/lib/rentalMetadata";
import {
  planPda,
  planVaultPda,
  subscriptionProgram,
} from "@/lib/subscription";
import { simulateAndSend } from "@/lib/tx";

export function NewRentalView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [amenities, setAmenities] = useState("");
  const [terms, setTerms] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("500");
  const [periodDays, setPeriodDays] = useState("30");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey) return;
    const rent = parseFloat(monthlyRent);
    const period = parseFloat(periodDays);
    if (!Number.isFinite(rent) || rent <= 0) {
      window.alert("Rent must be > 0 USDC.");
      return;
    }
    if (!Number.isFinite(period) || period < 1 || period > 365) {
      window.alert("Period must be 1–365 days.");
      return;
    }
    if (!title.trim()) {
      window.alert("Title is required.");
      return;
    }

    setBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const mint = getUsdcMint();
      const planId = BigInt(Math.floor(Date.now() / 1000));
      const [plan] = planPda(publicKey, planId);
      const [vault] = planVaultPda(plan);
      const priceBase = BigInt(Math.round(rent * USDC_UNIT));
      const periodSeconds = Math.round(period * 86400);

      const ix = await program.methods
        .createPlan(
          new BN(planId.toString()),
          new BN(priceBase.toString()),
          new BN(periodSeconds)
        )
        .accounts({
          creator: publicKey,
          mint,
          plan,
          vault,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as never)
        .instruction();

      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ix,
      ],
      });

      // Upload metadata AFTER the plan exists so filename = plan PDA.
      await uploadRentalMetadata(plan.toBase58(), {
        title: title.trim(),
        description: description.trim() || undefined,
        gallery: gallery.length > 0 ? gallery : undefined,
        videoUrl: videoUrl.trim() || undefined,
        location: location ?? undefined,
        amenities: amenities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        terms: terms.trim() || undefined,
        createdAt: new Date().toISOString(),
      });

      window.alert(`Listed. Tx: ${sig.slice(0, 12)}…`);
      router.push(`/marketplace/rentals/${plan.toBase58()}`);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "List failed");
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Centered>
        <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
        <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
          Connect a wallet to list a rental.
        </div>
        <WalletMultiButton />
      </Centered>
    );
  }

  return (
    <>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.45rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
          List a rental
        </h1>
        <Link href="/marketplace/rentals" style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none" }}>
          ← All rentals
        </Link>
      </header>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Loft in Savamala, 2 beds, parking"
            style={inputStyle}
            required
          />
        </Field>

        <Field label="Long description">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Neighborhood notes, layout, walk-to time to the center…"
            style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
          />
        </Field>

        <Field label="Photos (up to 10 — first is the cover)">
          <GalleryUploader
            value={gallery}
            onChange={setGallery}
            ownerPubkey={publicKey?.toBase58() ?? ""}
            keyPrefix="rental-gallery"
            maxImages={10}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="Monthly rent (USDC)">
            <input
              type="number"
              min={1}
              step="0.01"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
              style={inputStyle}
              required
            />
          </Field>
          <Field label="Period length (days)">
            <input
              type="number"
              min={1}
              max={365}
              value={periodDays}
              onChange={(e) => setPeriodDays(e.target.value)}
              style={inputStyle}
              required
            />
          </Field>
        </div>

        <Field label="Amenities (comma-separated)">
          <input
            type="text"
            value={amenities}
            onChange={(e) => setAmenities(e.target.value)}
            placeholder="Wi-Fi, Washer, AC, Pet-friendly, Parking"
            style={inputStyle}
          />
        </Field>

        <Field label="Terms / house rules">
          <textarea
            rows={3}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="No smoking, quiet hours 10pm–8am, pets on approval…"
            style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
          />
        </Field>

        <Field label="Video URL (optional)">
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/… or direct MP4"
            style={inputStyle}
          />
        </Field>

        <Field label="Location">
          <LocationPicker value={location} onChange={setLocation} />
        </Field>

        <div
          style={{
            background: "#eef2ff",
            color: "#3730a3",
            padding: "0.65rem 0.85rem",
            borderRadius: 8,
            fontSize: "0.78rem",
          }}
        >
          On subscribe, tenant pre-approves N cycles (default 12) so future
          rent pulls automatically via the delegate pattern — no re-signing
          each month. Platform fee comes out of each charge, the rest goes
          to your plan vault which you can withdraw anytime.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Link
            href="/marketplace/rentals"
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
            {busy ? "Listing…" : "List rental"}
          </button>
        </div>
      </form>
    </>
  );
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
