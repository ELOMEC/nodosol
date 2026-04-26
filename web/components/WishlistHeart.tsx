"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useCallback, useEffect, useState } from "react";

import {
  WishlistItemType,
  addToWishlist,
  fetchWishlist,
  removeFromWishlist,
} from "@/lib/wishlist";
import { getCachedChatJwt, setCachedChatJwt } from "@/lib/chatSession";
import { requestChatJwt } from "@/lib/supabase";

const JWT_REFRESH_SLACK_S = 60;

/**
 * Inline heart icon for marketplace cards. Stateless WRT visibility:
 * always rendered; opens wallet sign-in on first interaction so an
 * unconnected viewer sees the affordance and learns it's wallet-gated.
 *
 * Props:
 *   itemType — wishlist row taxonomy (event/auction/rental/asset/listing)
 *   itemId   — on-chain PDA / mint base58 string
 *   stopPropagation — set true when nested inside a clickable card so
 *                     toggling the heart doesn't navigate.
 */
export function WishlistHeart({
  itemType,
  itemId,
  stopPropagation = true,
  size = 20,
}: {
  itemType: WishlistItemType;
  itemId: string;
  stopPropagation?: boolean;
  size?: number;
}) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);

  const ensureJwt = useCallback(async (): Promise<string> => {
    if (!wallet || !signMessage) {
      throw new Error("Connect a wallet that supports message signing.");
    }
    const now = Math.floor(Date.now() / 1000);
    const cached = getCachedChatJwt(wallet);
    if (cached && cached.expiresAt - now > JWT_REFRESH_SLACK_S) {
      return cached.jwt;
    }
    const timestamp = Date.now();
    const message = `nodosol-chat-auth:v1:${wallet}:${timestamp}`;
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    const { jwt, expiresAt } = await requestChatJwt({
      wallet,
      message,
      signatureBase58: bs58.encode(sigBytes),
    });
    setCachedChatJwt(wallet, { jwt, expiresAt });
    return jwt;
  }, [wallet, signMessage]);

  // Resolve initial state from the cached JWT — without a token we
  // can't tell, so the heart renders empty and the first click prompts
  // a signature.
  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setSaved(null);
      return;
    }
    const cached = getCachedChatJwt(wallet);
    if (!cached) {
      setSaved(false);
      return;
    }
    void (async () => {
      const rows = await fetchWishlist(cached.jwt);
      if (cancelled) return;
      setSaved(rows.some((r) => r.item_type === itemType && r.item_id === itemId));
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, itemType, itemId]);

  const onClick = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!wallet) return;
    setBusy(true);
    try {
      const jwt = await ensureJwt();
      if (saved) {
        const r = await removeFromWishlist(jwt, wallet, itemType, itemId);
        if (r.ok) setSaved(false);
      } else {
        const r = await addToWishlist(jwt, wallet, itemType, itemId);
        if (r.ok) setSaved(true);
      }
    } catch (err) {
      console.warn("wishlist toggle failed", err);
    } finally {
      setBusy(false);
    }
  };

  const filled = saved === true;
  const disabled = !wallet || busy;
  const ariaLabel = saved ? "Remove from wishlist" : "Add to wishlist";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={!wallet ? "Connect a wallet to save" : ariaLabel}
      style={{
        background: "transparent",
        border: "none",
        padding: 4,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: filled ? "#ef4444" : "var(--shell-faint)",
        opacity: !wallet ? 0.4 : 1,
        transition: "color 0.15s, transform 0.1s",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </button>
  );
}
