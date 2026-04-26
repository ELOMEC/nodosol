"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCachedChatJwt, setCachedChatJwt } from "@/lib/chatSession";
import { requestChatJwt } from "@/lib/supabase";
import {
  WishlistItemType,
  WishlistRow,
  fetchWishlist,
  removeFromWishlist,
} from "@/lib/wishlist";

const JWT_REFRESH_SLACK_S = 60;

const TYPE_LABEL: Record<WishlistItemType, string> = {
  event: "Events",
  auction: "Auctions",
  rental: "Rentals",
  asset: "Assets",
  listing: "Listings",
};

const TYPE_HREF_PREFIX: Record<WishlistItemType, string> = {
  event: "/marketplace/events/v/",
  auction: "/marketplace/auctions/",
  rental: "/marketplace/rentals/",
  asset: "/marketplace/assets/",
  listing: "/marketplace/",
};

export function WishlistView() {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [rows, setRows] = useState<WishlistRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const reload = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const jwt = await ensureJwt();
      const next = await fetchWishlist(jwt);
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wishlist");
    } finally {
      setBusy(false);
    }
  }, [wallet, ensureJwt]);

  useEffect(() => {
    if (wallet) void reload();
    else setRows(null);
  }, [wallet, reload]);

  async function remove(row: WishlistRow) {
    if (!wallet) return;
    try {
      const jwt = await ensureJwt();
      const r = await removeFromWishlist(jwt, wallet, row.item_type, row.item_id);
      if (r.ok) {
        setRows((prev) =>
          prev ? prev.filter((x) => !(x.item_type === row.item_type && x.item_id === row.item_id)) : prev,
        );
      }
    } catch (err) {
      console.warn("remove failed", err);
    }
  }

  if (!wallet) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Wishlist</h1>
        <p style={SUB}>Connect a wallet to see and manage saved items.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const grouped = (rows ?? []).reduce<Record<WishlistItemType, WishlistRow[]>>(
    (acc, r) => {
      (acc[r.item_type] ||= []).push(r);
      return acc;
    },
    {} as Record<WishlistItemType, WishlistRow[]>,
  );

  const types: WishlistItemType[] = ["event", "auction", "rental", "asset", "listing"];

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Wishlist</h1>
          <p style={SUB}>
            Items you&apos;ve saved across the marketplace. Tap the heart on
            any card to add or remove.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={busy} style={BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      {!rows ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : rows.length === 0 ? (
        <div style={CARD}>
          <h2 style={H2}>Nothing saved yet</h2>
          <p style={CARD_SUB}>
            Browse the{" "}
            <Link href="/marketplace" style={LINK}>
              marketplace
            </Link>{" "}
            and tap the heart on any card to keep it here.
          </p>
        </div>
      ) : (
        types.map((t) => {
          const list = grouped[t];
          if (!list || list.length === 0) return null;
          return (
            <section key={t} style={CARD}>
              <header style={CARD_HEAD}>
                <h2 style={H2}>{TYPE_LABEL[t]}</h2>
                <span style={CARD_HINT}>{list.length} saved</span>
              </header>
              <ul style={LIST}>
                {list.map((r) => (
                  <li key={`${r.item_type}-${r.item_id}`} style={ROW}>
                    <Link href={`${TYPE_HREF_PREFIX[r.item_type]}${r.item_id}`} style={ROW_LINK}>
                      <code style={MONO}>{shortPubkey(r.item_id)}</code>
                      <span style={ROW_META}>{formatDate(r.created_at)}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(r)}
                      style={REMOVE_BTN}
                      aria-label="Remove"
                      title="Remove from wishlist"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function shortPubkey(p: string): string {
  return p.length > 10 ? `${p.slice(0, 6)}…${p.slice(-6)}` : p;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.55rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  color: "var(--shell-fg)",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.9rem",
  lineHeight: 1.5,
  maxWidth: 560,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1.1rem 1.2rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card-bg)",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "0.85rem",
  marginBottom: "0.75rem",
};

const CARD_HINT: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-faint)",
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  lineHeight: 1.5,
};

const H2: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
};

const LINK: React.CSSProperties = {
  color: "var(--shell-link)",
  textDecoration: "underline",
};

const LIST: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  padding: "0.4rem 0",
};

const ROW_LINK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  textDecoration: "none",
  color: "var(--shell-fg)",
  flex: 1,
  minWidth: 0,
};

const ROW_META: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-faint)",
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.82rem",
};

const BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const REMOVE_BTN: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--shell-border)",
  color: "var(--shell-muted)",
  width: 24,
  height: 24,
  borderRadius: 6,
  fontSize: "0.95rem",
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};
