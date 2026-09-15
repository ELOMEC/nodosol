"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AnnouncementRow,
  AnnouncementSeverity,
  renderBody,
  severityPalette,
} from "@/lib/announcements";
import { useToast } from "@/components/ToastProvider";

const SEVERITIES: AnnouncementSeverity[] = ["info", "release", "warning", "urgent"];

const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

type DraftState = {
  id?: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  pinned: boolean;
  published_at: string;
  expires_at: string;
};

const EMPTY_DRAFT: DraftState = {
  title: "",
  body: "",
  severity: "info",
  pinned: false,
  published_at: "",
  expires_at: "",
};

function rowToDraft(row: AnnouncementRow): DraftState {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    pinned: row.pinned,
    published_at: row.published_at ? toLocalInput(row.published_at) : "",
    expires_at: row.expires_at ? toLocalInput(row.expires_at) : "",
  };
}

function toLocalInput(iso: string): string {
  // datetime-local needs `YYYY-MM-DDTHH:mm` — strip seconds + tz.
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminAnnouncementsView() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const isAdmin = useMemo(() => Boolean(wallet && ADMIN_LIST.has(wallet)), [wallet]);
  const toast = useToast();

  const [rows, setRows] = useState<AnnouncementRow[] | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!wallet || !isAdmin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/announcements", {
        headers: { "x-nodosol-admin-wallet": wallet },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as
        | { ok: true; rows: AnnouncementRow[] }
        | { ok: false; error?: string; reason?: string };
      if (!res.ok || !json.ok) {
        const detail =
          ("error" in json && json.error) ||
          ("reason" in json && json.reason) ||
          (res.status === 403 ? "wallet not on admin allowlist (server side)" : "no error message");
        setError(`API ${res.status}: ${detail}`);
        return;
      }
      setRows(json.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }, [wallet, isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function setField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!wallet) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error("Title + body required");
      return;
    }
    setBusy(true);
    try {
      const method = draft.id ? "PATCH" : "POST";
      const res = await fetch("/api/admin/announcements", {
        method,
        headers: {
          "x-nodosol-admin-wallet": wallet,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: draft.id,
          title: draft.title,
          body: draft.body,
          severity: draft.severity,
          pinned: draft.pinned,
          published_at: draft.published_at
            ? new Date(draft.published_at).toISOString()
            : null,
          expires_at: draft.expires_at
            ? new Date(draft.expires_at).toISOString()
            : null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Save failed");
        return;
      }
      toast.success(draft.id ? "Updated" : "Published");
      setDraft(EMPTY_DRAFT);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!wallet) return;
    if (!confirm("Delete this announcement?")) return;
    try {
      const res = await fetch(
        `/api/admin/announcements?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { "x-nodosol-admin-wallet": wallet },
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Delete failed");
        return;
      }
      toast.success("Deleted");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!wallet) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Announcements admin</h1>
        <p style={SUB}>Connect an allowlisted wallet to manage announcements.</p>
        <WalletMultiButton />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Forbidden</h1>
        <p style={SUB}>
          This wallet isn&apos;t in the admin allowlist
          (<code>NEXT_PUBLIC_ADMIN_WALLETS</code>).
        </p>
      </div>
    );
  }

  const previewHtml = renderBody(draft.body || "_Nothing yet — start typing._");

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Announcements</h1>
          <p style={SUB}>
            Service-role writes via <code>/api/admin/announcements</code>.
            Drafts (future <code>published_at</code>) and expired rows
            stay hidden from <code>/announcements</code>.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={busy} style={SECONDARY_BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      <section style={CARD}>
        <h2 style={H2}>{draft.id ? "Edit" : "New announcement"}</h2>
        <div style={GRID}>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Title</span>
            <input
              value={draft.title}
              onChange={(e) => setField("title", e.target.value)}
              maxLength={200}
              style={INPUT}
            />
          </label>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Severity</span>
            <select
              value={draft.severity}
              onChange={(e) => setField("severity", e.target.value as AnnouncementSeverity)}
              style={INPUT}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{severityPalette(s).label}</option>
              ))}
            </select>
          </label>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Publish at</span>
            <input
              type="datetime-local"
              value={draft.published_at}
              onChange={(e) => setField("published_at", e.target.value)}
              style={INPUT}
            />
          </label>
          <label style={LABEL}>
            <span style={LABEL_TEXT}>Expires at (optional)</span>
            <input
              type="datetime-local"
              value={draft.expires_at}
              onChange={(e) => setField("expires_at", e.target.value)}
              style={INPUT}
            />
          </label>
        </div>
        <label style={{ ...LABEL, marginTop: "0.6rem" }}>
          <span style={LABEL_TEXT}>
            Body — Markdown lite (`code`, **bold**, [link](https://…)),
            blank line = new paragraph.
          </span>
          <textarea
            value={draft.body}
            onChange={(e) => setField("body", e.target.value)}
            rows={8}
            maxLength={8000}
            style={{ ...INPUT, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </label>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", marginTop: "0.6rem" }}
        >
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => setField("pinned", e.target.checked)}
          />
          <span style={LABEL_TEXT}>
            Pin (warning + urgent pinned rows also drive the global
            banner in MarketplaceShell)
          </span>
        </label>

        <div style={PREVIEW_HEAD}>Preview</div>
        <div style={PREVIEW_BODY} dangerouslySetInnerHTML={{ __html: previewHtml }} />

        <div style={{ display: "flex", gap: "0.55rem", justifyContent: "flex-end", marginTop: "0.85rem" }}>
          {draft.id ? (
            <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} style={SECONDARY_BTN}>
              New instead
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} disabled={busy} style={PRIMARY_BTN}>
            {busy ? "Saving…" : draft.id ? "Update" : "Publish"}
          </button>
        </div>
      </section>

      {!rows ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : rows.length === 0 ? (
        <p style={SUB}>No announcements yet.</p>
      ) : (
        <section style={CARD}>
          <h2 style={H2}>All announcements ({rows.length})</h2>
          <ul style={LIST}>
            {rows.map((row) => {
              const palette = severityPalette(row.severity);
              const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
              const future = new Date(row.published_at).getTime() > Date.now();
              return (
                <li key={row.id} style={ROW}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      {row.pinned ? <span style={PIN}>📌</span> : null}
                      <span
                        style={{
                          ...BADGE,
                          background: palette.bg,
                          color: palette.fg,
                          borderColor: palette.border,
                        }}
                      >
                        {palette.label}
                      </span>
                      {future ? <span style={STATUS_FUTURE}>scheduled</span> : null}
                      {expired ? <span style={STATUS_EXPIRED}>expired</span> : null}
                      <span style={ROW_STAMP}>
                        {new Date(row.published_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={ROW_TITLE}>{row.title}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                    <button type="button" onClick={() => setDraft(rowToDraft(row))} style={EDIT_BTN}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(row.id)} style={DELETE_BTN}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
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
  maxWidth: 620,
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

const H2: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
  marginBottom: "0.65rem",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "0.6rem",
};

const LABEL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const LABEL_TEXT: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
};

const INPUT: React.CSSProperties = {
  padding: "0.5rem 0.7rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  background: "var(--shell-input-bg)",
  color: "var(--shell-fg)",
  fontSize: "0.88rem",
  fontFamily: "inherit",
};

const PREVIEW_HEAD: React.CSSProperties = {
  marginTop: "1rem",
  fontSize: "0.74rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--shell-faint)",
  marginBottom: "0.4rem",
};

const PREVIEW_BODY: React.CSSProperties = {
  fontSize: "0.92rem",
  lineHeight: 1.6,
  color: "var(--shell-muted)",
  background: "var(--shell-pill-bg)",
  border: "1px dashed var(--shell-border)",
  borderRadius: 8,
  padding: "0.75rem 0.9rem",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "var(--shell-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.5rem 1.1rem",
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 1.1rem",
  fontSize: "0.88rem",
  cursor: "pointer",
};

const LIST: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  borderBottom: "1px solid var(--shell-divider)",
  padding: "0.55rem 0",
};

const PIN: React.CSSProperties = {
  fontSize: "0.85rem",
};

const BADGE: React.CSSProperties = {
  display: "inline-flex",
  padding: "0.12rem 0.45rem",
  borderRadius: 999,
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  border: "1px solid",
};

const STATUS_FUTURE: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#7b9cff",
  background: "rgba(123,156,255,0.12)",
  padding: "0.1rem 0.4rem",
  borderRadius: 999,
};

const STATUS_EXPIRED: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#9ca3af",
  background: "rgba(148,163,184,0.18)",
  padding: "0.1rem 0.4rem",
  borderRadius: 999,
};

const ROW_STAMP: React.CSSProperties = {
  fontSize: "0.74rem",
  color: "var(--shell-faint)",
};

const ROW_TITLE: React.CSSProperties = {
  fontWeight: 500,
  fontSize: "0.92rem",
  marginTop: "0.25rem",
};

const EDIT_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 6,
  padding: "0.3rem 0.65rem",
  fontSize: "0.78rem",
  cursor: "pointer",
};

const DELETE_BTN: React.CSSProperties = {
  background: "transparent",
  color: "#b91c1c",
  border: "1px solid rgba(239,68,68,0.32)",
  borderRadius: 6,
  padding: "0.3rem 0.65rem",
  fontSize: "0.78rem",
  cursor: "pointer",
};
