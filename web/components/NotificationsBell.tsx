"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";

import tipJarIdl from "@/idl/tip_jar.json";
import subscriptionIdl from "@/idl/subscription.json";
import eventsIdl from "@/idl/events.json";
import registryIdl from "@/idl/rwa_registry.json";
import mintIdl from "@/idl/rwa_mint.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import eventTicketsIdl from "@/idl/event_tickets.json";

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
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement | null>(null);

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
    void reload();
    // Re-fetch every 60s in the background.
    const interval = setInterval(() => void reload(), 60_000);
    return () => clearInterval(interval);
  }, [reload]);

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

  const unreadCount = items.filter((it) => !seenRef.current.has(it.signature)).length;

  return (
    <div ref={popoverRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: open ? "#eef2ff" : "#f7f8fa",
          border: "1px solid",
          borderColor: open ? "#c7d2fe" : "#eef0f3",
          color: "#4b5563",
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
            background: "#ffffff",
            border: "1px solid #eef0f3",
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
              borderBottom: "1px solid #eef0f3",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>Recent activity</div>
              <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>
                Last 3 txs from each of {PROGRAMS.length} programs
              </div>
            </div>
            <button
              onClick={() => void reload()}
              disabled={loading}
              style={{
                background: "transparent",
                border: "1px solid #e5e7eb",
                color: "#4b5563",
                padding: "0.25rem 0.6rem",
                borderRadius: 6,
                fontSize: "0.74rem",
                fontWeight: 500,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? "…" : "Refresh"}
            </button>
          </header>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {error ? (
              <div style={{ padding: "1rem", fontSize: "0.85rem", color: "#b91c1c" }}>{error}</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "1.5rem 1rem", fontSize: "0.85rem", color: "#6b7280", textAlign: "center" }}>
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
                      borderBottom: "1px solid #f3f4f6",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "0.4rem",
                      textDecoration: "none",
                      color: "#111827",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.18rem" }}>
                        {unseen ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4f46e5" }} /> : null}
                        <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "#4338ca", fontSize: "0.8rem", fontWeight: 600 }}>
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
                      <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "#9ca3af", fontSize: "0.72rem" }}>
                        {it.signature.slice(0, 10)}…{it.signature.slice(-6)}
                      </code>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af", alignSelf: "center" }}>
                      {it.blockTime ? timeAgo(it.blockTime) : `slot ${it.slot}`}
                    </div>
                  </a>
                );
              })
            )}
          </div>

          <footer style={{ padding: "0.65rem 1rem", borderTop: "1px solid #eef0f3" }}>
            <a
              href="/stats"
              style={{
                fontSize: "0.8rem",
                color: "#4338ca",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              See full stats →
            </a>
          </footer>
        </div>
      ) : null}
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
