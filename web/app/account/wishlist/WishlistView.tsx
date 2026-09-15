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
      <div style={CONNECT_PANEL}>
        <span style={EYEBROW}>Saved market</span>
        <h1 style={H1}>Wishlist</h1>
        <p style={SUB}>
          Connect a wallet to see saved assets, auctions, rentals, listings,
          and event opportunities.
        </p>
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
  const totalSaved = rows?.length ?? 0;

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div>
          <span style={EYEBROW}>Saved market</span>
          <h1 style={H1}>Wishlist</h1>
          <p style={SUB}>
            Items you&apos;ve saved across the marketplace. Tap the heart on
            any card to add or remove.
          </p>
        </div>
        <div style={HERO_ACTIONS}>
          <Link href="/marketplace" style={SECONDARY_LINK}>
            Browse market
          </Link>
        <button type="button" onClick={() => void reload()} disabled={busy} style={BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
        </div>
      </header>

      <div style={STAT_GRID}>
        <MiniStat label="Saved" value={rows ? totalSaved.toLocaleString() : "—"} />
        <MiniStat label="Asset groups" value={rows ? Object.keys(grouped).length.toLocaleString() : "—"} />
        <MiniStat label="Wallet" value={shortPubkey(wallet)} />
      </div>

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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={STAT_CARD}>
      <span style={STAT_LABEL}>{label}</span>
      <strong style={STAT_VALUE}>{value}</strong>
    </div>
  );
}

const PAGE: React.CSSProperties = {
  padding: "1.4rem 0 2.5rem",
};

const CONNECT_PANEL: React.CSSProperties = {
  margin: "1.5rem 0",
  maxWidth: 680,
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  padding: "1.45rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(241,245,249,0.9))",
  boxShadow: "0 20px 55px rgba(15, 23, 42, 0.08)",
};

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1.25rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 22,
  padding: "1.35rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,253,245,0.78))",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const EYEBROW: React.CSSProperties = {
  display: "inline-flex",
  marginBottom: "0.55rem",
  color: "#047857",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const H1: React.CSSProperties = {
  fontSize: "2.7rem",
  fontWeight: 800,
  marginBottom: "0.45rem",
  color: "var(--shell-fg)",
  lineHeight: 1.05,
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.98rem",
  lineHeight: 1.6,
  maxWidth: 700,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 16,
  padding: "1.1rem 1.15rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card)",
  boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
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
  color: "var(--shell-muted)",
  fontWeight: 700,
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  lineHeight: 1.5,
};

const H2: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 800,
  color: "var(--shell-fg)",
};

const LINK: React.CSSProperties = {
  color: "#047857",
  textDecoration: "none",
  fontWeight: 800,
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
  border: "1px solid rgba(226, 232, 240, 0.9)",
  borderRadius: 12,
  padding: "0.72rem 0.8rem",
  background: "rgba(248, 250, 252, 0.82)",
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
  color: "var(--shell-muted)",
  fontWeight: 700,
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.82rem",
};

const BTN: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
  borderRadius: 999,
  padding: "0.68rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 800,
  cursor: "pointer",
};

const REMOVE_BTN: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--shell-border)",
  color: "var(--shell-muted)",
  width: 30,
  height: 30,
  borderRadius: 999,
  fontSize: "0.95rem",
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};

const HERO_ACTIONS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const SECONDARY_LINK: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 999,
  padding: "0.68rem 1rem",
  color: "var(--shell-fg)",
  background: "rgba(255,255,255,0.78)",
  textDecoration: "none",
  fontSize: "0.85rem",
  fontWeight: 800,
};

const STAT_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.85rem",
  marginBottom: "1.15rem",
};

const STAT_CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 16,
  padding: "0.95rem 1rem",
  background: "rgba(255,255,255,0.9)",
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.05)",
};

const STAT_LABEL: React.CSSProperties = {
  display: "block",
  color: "var(--shell-muted)",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "0.35rem",
};

const STAT_VALUE: React.CSSProperties = {
  color: "var(--shell-fg)",
  fontSize: "1.2rem",
  lineHeight: 1.1,
  overflowWrap: "anywhere",
};
