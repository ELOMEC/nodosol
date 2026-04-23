"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

import { ChatPanel } from "./ChatPanel";
import { deriveListingMemoHash } from "@/lib/supabase";

type ListingKind = "event" | "rental" | "auction" | "asset";

type Props = {
  listingKind: ListingKind;
  listingPda: string;
  sellerPubkey: string;
  /** Pulled from the listing's off-chain metadata. When false the button
   *  hides entirely — the seller opted out. */
  allowChat: boolean;
  /** Label override — defaults to a sensible per-kind phrase. */
  label?: string;
};

const DEFAULT_LABEL: Record<ListingKind, string> = {
  event: "Contact organiser",
  rental: "Contact landlord",
  auction: "Contact seller",
  asset: "Contact owner",
};

export function ContactSellerButton({
  listingKind,
  listingPda,
  sellerPubkey,
  allowChat,
  label,
}: Props) {
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [memoHash, setMemoHash] = useState<string | null>(null);

  const viewerPubkey = publicKey?.toBase58() ?? null;
  const isSelf = viewerPubkey === sellerPubkey;

  useEffect(() => {
    if (!open || !viewerPubkey) {
      setMemoHash(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const h = await deriveListingMemoHash(
        listingKind,
        listingPda,
        sellerPubkey,
        viewerPubkey,
      );
      if (!cancelled) setMemoHash(h);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, viewerPubkey, listingKind, listingPda, sellerPubkey]);

  // Hidden if: seller opted out, or viewer IS the seller (no point DM-ing
  // yourself), or no wallet connected (nothing to DM from).
  if (!allowChat || isSelf || !viewerPubkey) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.5rem 0.9rem",
          border: "1px solid var(--shell-border, #e5e7eb)",
          borderRadius: 8,
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
          fontSize: "0.86rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span aria-hidden>💬</span>
        {label ?? DEFAULT_LABEL[listingKind]}
      </button>

      {open && memoHash ? (
        <ChatPanel
          thread={{
            kind: "listing_dm",
            memoHash,
            sellerPubkey,
            buyerPubkey: viewerPubkey,
            listingKind,
            listingPda,
          }}
          viewerPubkey={viewerPubkey}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
