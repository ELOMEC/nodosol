"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import tipJarIdl from "@/idl/tip_jar.json";
import subscriptionIdl from "@/idl/subscription.json";
import eventsIdl from "@/idl/events.json";
import registryIdl from "@/idl/rwa_registry.json";
import mintIdl from "@/idl/rwa_mint.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import eventTicketsIdl from "@/idl/event_tickets.json";

import { useToast } from "@/components/ToastProvider";
import { getCachedChatJwt } from "@/lib/chatSession";
import {
  fetchNotifications,
  markNotificationsRead,
  NotificationRow,
  subscribeToNotifications,
} from "@/lib/notifications";
import { createAuthedSupabaseClient } from "@/lib/supabase";

type FilterKey = "all" | "tips" | "sales" | "subscriptions" | "auctions";

const FILTER_CHIPS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "tips", label: "Tips" },
  { key: "sales", label: "Sales" },
  { key: "subscriptions", label: "Subs" },
  { key: "auctions", label: "Auctions" },
];

const TYPE_TO_CATEGORY: Record<string, FilterKey> = {
  tip_received: "tips",
  tip_sent: "tips",
  ticket_sold: "sales",
  ticket_bought: "sales",
  listing_sold: "sales",
  listing_bought: "sales",
  resale_sold: "sales",
  resale_bought: "sales",
  subscription_charged: "subscriptions",
  subscription_revenue: "subscriptions",
  subscription_expired: "subscriptions",
  bid_committed: "auctions",
  bid_revealed: "auctions",
  auction_settled_seller: "auctions",
  otc_proposed: "auctions",
  otc_accepted: "auctions",
  otc_accepted_self: "auctions",
};

function categoriseNotification(type: string): FilterKey {
  return TYPE_TO_CATEGORY[type] ?? "all";
}

type DayBucket = {
  label: "Today" | "Yesterday" | "Earlier";
  rows: NotificationRow[];
};

function bucketByDay(rows: NotificationRow[]): DayBucket[] {
  if (rows.length === 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;

  const todayRows: NotificationRow[] = [];
  const yesterdayRows: NotificationRow[] = [];
  const earlierRows: NotificationRow[] = [];

  for (const row of rows) {
    const ts = new Date(row.created_at).getTime();
    if (ts >= todayMs) todayRows.push(row);
    else if (ts >= yesterdayMs) yesterdayRows.push(row);
    else earlierRows.push(row);
  }

  const buckets: DayBucket[] = [];
  if (todayRows.length) buckets.push({ label: "Today", rows: todayRows });
  if (yesterdayRows.length) buckets.push({ label: "Yesterday", rows: yesterdayRows });
  if (earlierRows.length) buckets.push({ label: "Earlier", rows: earlierRows });
  return buckets;
}

const PROGRAMS = [
  { label: "tip_jar", id: (tipJarIdl as { address: string }).address },
  { label: "subscription", id: (subscriptionIdl as { address: string }).address },
  { label: "events", id: (eventsIdl as { address: string }).address },
  { label: "rwa_registry", id: (registryIdl as { address: string }).address },
  { label: "rwa_mint", id: (mintIdl as { address: string }).address },
  { label: "marketplace", id: (marketplaceIdl as { address: string }).address },
  { label: "otc_deals", id: (otcIdl as { address: string }).address },
  { label: "event_tickets", id: (eventTicketsIdl as { address: string }).address },
];

type Activity = {
  program: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
};

const SEEN_KEY = "nodosol-seen-sigs-v1";

function loadSeenSet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSeenSet(set: Set<string>): void {
  try {
    // Cap at 200 to avoid unbounded growth.
    const arr = Array.from(set).slice(-200);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function NotificationsBell() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [personalItems, setPersonalItems] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const toast = useToast();

  const wallet = publicKey?.toBase58() ?? null;
  const cachedJwt = useMemo(() => (wallet ? getCachedChatJwt(wallet) : null), [wallet]);
  const hasPersonalAuth = Boolean(cachedJwt && cachedJwt.expiresAt > Math.floor(Date.now() / 1000) + 30);

  // Initial load on mount.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        PROGRAMS.map(async ({ label, id }) => {
          try {
            const sigs = await connection.getSignaturesForAddress(new PublicKey(id), { limit: 3 });
            return { label, sigs };
          } catch {
            return { label, sigs: [] as ConfirmedSignatureInfo[] };
          }
        })
      );
      const merged: Activity[] = [];
      for (const { label, sigs } of results) {
        for (const s of sigs) {
          merged.push({
            program: label,
            signature: s.signature,
            slot: s.slot,
            blockTime: s.blockTime ?? null,
            err: s.err !== null,
          });
        }
      }
      merged.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
      setItems(merged.slice(0, 12));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    seenRef.current = loadSeenSet();
    if (!hasPersonalAuth) {
      // Personal feed not available — fall back to RPC global activity.
      void reload();
      const interval = setInterval(() => void reload(), 60_000);
      return () => clearInterval(interval);
    }
  }, [reload, hasPersonalAuth]);

  // Personal feed: load + subscribe to inserts when wallet has a cached JWT.
  useEffect(() => {
    if (!wallet || !cachedJwt || !hasPersonalAuth) {
      setPersonalItems(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const rows = await fetchNotifications(cachedJwt.jwt, 30);
      if (!cancelled) setPersonalItems(rows);
    })();

    const client = createAuthedSupabaseClient(cachedJwt.jwt);
    client.realtime.setAuth(cachedJwt.jwt);
    const unsubscribe = subscribeToNotifications(client, wallet, (row) => {
      setPersonalItems((prev) => (prev ? [row, ...prev].slice(0, 30) : [row]));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [wallet, cachedJwt, hasPersonalAuth]);

  // When the dropdown opens AND we have a personal feed, mark all as read.
  // Toasts the count so the action is visible (vs the previous silent flip).
  useEffect(() => {
    if (!open || !cachedJwt || !personalItems) return;
    const unreadIds = personalItems.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    void markNotificationsRead(cachedJwt.jwt, unreadIds);
    setPersonalItems((prev) =>
      prev ? prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)) : prev
    );
    toast.info(
      unreadIds.length === 1
        ? "1 notification marked read"
        : `${unreadIds.length} notifications marked read`,
      { durationMs: 2500 }
    );
  }, [open, cachedJwt, personalItems, toast]);

  // When the dropdown opens, mark current items as seen.
  useEffect(() => {
    if (!open) return;
    const next = new Set(seenRef.current);
    for (const it of items) next.add(it.signature);
    seenRef.current = next;
    persistSeenSet(next);
  }, [open, items]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unreadCount = personalItems
    ? personalItems.filter((n) => !n.read).length
    : items.filter((it) => !seenRef.current.has(it.signature)).length;

  const filteredPersonal = useMemo(() => {
    if (!personalItems) return null;
    if (filter === "all") return personalItems;
    return personalItems.filter((n) => categoriseNotification(n.type) === filter);
  }, [personalItems, filter]);

  const personalBuckets = useMemo(
    () => (filteredPersonal ? bucketByDay(filteredPersonal) : []),
    [filteredPersonal]
  );

  return (
    <div ref={popoverRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: open ? "var(--shell-active-bg)" : "var(--shell-pill-bg)",
          border: "1px solid",
          borderColor: open ? "#c7d2fe" : "var(--shell-border)",
          color: "var(--shell-muted)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              borderRadius: 9,
              background: "#ef4444",
              color: "#fff",
              fontSize: "0.65rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            right: 0,
            width: 360,
            maxHeight: 480,
            background: "var(--shell-card)",
            border: "1px solid var(--shell-border)",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <header
            style={{
              padding: "0.85rem 1rem",
              borderBottom: "1px solid var(--shell-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                {personalItems ? "Your notifications" : "Recent activity"}
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--shell-muted)" }}>
                {personalItems
                  ? "Push-driven, scoped to your wallet"
                  : `Last 3 txs from each of ${PROGRAMS.length} programs`}
              </div>
            </div>
            {!personalItems ? (
              <button
                onClick={() => void reload()}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "1px solid var(--shell-border-strong)",
                  color: "var(--shell-muted)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  fontWeight: 500,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "…" : "Refresh"}
              </button>
            ) : null}
          </header>

          {personalItems ? (
            <div
              style={{
                display: "flex",
                gap: "0.35rem",
                padding: "0.55rem 1rem",
                borderBottom: "1px solid var(--shell-divider)",
                overflowX: "auto",
              }}
            >
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key)}
                  style={{
                    padding: "0.18rem 0.6rem",
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: filter === chip.key ? "var(--shell-link)" : "var(--shell-border)",
                    background: filter === chip.key ? "rgba(79,70,229,0.12)" : "transparent",
                    color: filter === chip.key ? "var(--shell-link)" : "var(--shell-muted)",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ overflowY: "auto", flex: 1 }}>
            {personalItems ? (
              personalItems.length === 0 ? (
                <EmptyPersonalState />
              ) : filteredPersonal && filteredPersonal.length === 0 ? (
                <div style={{ padding: "1.25rem 1rem", fontSize: "0.82rem", color: "var(--shell-muted)", textAlign: "center" }}>
                  Nothing in this category yet.
                </div>
              ) : (
                personalBuckets.map((bucket) => (
                  <section key={bucket.label}>
                    <div
                      style={{
                        padding: "0.45rem 1rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--shell-faint)",
                        background: "var(--shell-pill-bg)",
                        borderBottom: "1px solid var(--shell-divider)",
                      }}
                    >
                      {bucket.label}
                    </div>
                    {bucket.rows.map((n) => (
                      <a
                        key={n.id}
                        href={n.href ?? (n.signature ? `https://explorer.solana.com/tx/${n.signature}?cluster=devnet` : "#")}
                        target={n.href?.startsWith("http") || !n.href ? "_blank" : undefined}
                        rel="noreferrer"
                        style={{
                          padding: "0.7rem 1rem",
                          borderBottom: "1px solid var(--shell-divider)",
                          display: "block",
                          textDecoration: "none",
                          color: "var(--shell-fg)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                          {!n.read ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4f46e5" }} /> : null}
                          <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{n.title}</div>
                        </div>
                        {n.body ? (
                          <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)" }}>{n.body}</div>
                        ) : null}
                        <div style={{ fontSize: "0.7rem", color: "var(--shell-faint)", marginTop: "0.3rem" }}>
                          {timeAgo(Math.floor(new Date(n.created_at).getTime() / 1000))}
                        </div>
                      </a>
                    ))}
                  </section>
                ))
              )
            ) : error ? (
              <div style={{ padding: "1rem", fontSize: "0.85rem", color: "#b91c1c" }}>{error}</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "1.5rem 1rem", fontSize: "0.85rem", color: "var(--shell-muted)", textAlign: "center" }}>
                {loading ? "Loading…" : "No on-chain activity yet."}
              </div>
            ) : (
              items.map((it) => {
                const unseen = !seenRef.current.has(it.signature);
                return (
                  <a
                    key={it.signature}
                    href={`https://explorer.solana.com/tx/${it.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "0.7rem 1rem",
                      borderBottom: "1px solid var(--shell-divider)",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "0.4rem",
                      textDecoration: "none",
                      color: "var(--shell-fg)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.18rem" }}>
                        {unseen ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4f46e5" }} /> : null}
                        <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "var(--shell-link)", fontSize: "0.8rem", fontWeight: 600 }}>
                          {it.program}
                        </code>
                        <span
                          style={{
                            fontSize: "0.66rem",
                            padding: "0.1rem 0.4rem",
                            borderRadius: 4,
                            fontWeight: 600,
                            background: it.err ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                            color: it.err ? "#b91c1c" : "#059669",
                          }}
                        >
                          {it.err ? "FAILED" : "OK"}
                        </span>
                      </div>
                      <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "var(--shell-faint)", fontSize: "0.72rem" }}>
                        {it.signature.slice(0, 10)}…{it.signature.slice(-6)}
                      </code>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)", alignSelf: "center" }}>
                      {it.blockTime ? timeAgo(it.blockTime) : `slot ${it.slot}`}
                    </div>
                  </a>
                );
              })
            )}
          </div>

          <footer
            style={{
              padding: "0.65rem 1rem",
              borderTop: "1px solid var(--shell-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <a
              href="/stats"
              style={{
                fontSize: "0.8rem",
                color: "var(--shell-link)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              See full stats →
            </a>
            {personalItems ? (
              <a
                href="/settings/notifications"
                style={{
                  fontSize: "0.78rem",
                  color: "var(--shell-muted)",
                  textDecoration: "none",
                }}
              >
                Settings
              </a>
            ) : null}
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function EmptyPersonalState() {
  return (
    <div
      style={{
        padding: "1.6rem 1rem 1.4rem",
        textAlign: "center" as const,
        color: "var(--shell-muted)",
      }}
    >
      <svg
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.55, marginBottom: "0.7rem" }}
        aria-hidden="true"
      >
        <path d="M48 26a16 16 0 10-32 0c0 18-7 24-7 24h46s-7-6-7-24" />
        <path d="M27 56a5 5 0 0010 0" />
        <circle cx="32" cy="26" r="3" />
      </svg>
      <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--shell-fg)", marginBottom: "0.3rem" }}>
        No activity yet
      </div>
      <div style={{ fontSize: "0.78rem", lineHeight: 1.5, marginBottom: "0.9rem" }}>
        Share your creator profile to start receiving tips, sales, and subscription
        notifications in real time.
      </div>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
        <a
          href="/creator/profile"
          style={{
            background: "var(--shell-link)",
            color: "#fff",
            padding: "0.45rem 0.9rem",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: "0.78rem",
            fontWeight: 600,
          }}
        >
          Set up profile
        </a>
        <a
          href="/settings/notifications"
          style={{
            border: "1px solid var(--shell-border)",
            color: "var(--shell-fg)",
            padding: "0.45rem 0.9rem",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: "0.78rem",
            fontWeight: 600,
          }}
        >
          Email settings
        </a>
      </div>
    </div>
  );
}

function timeAgo(blockTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - blockTime);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}
