"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  legalStarter,
  renderMarkdown,
  type LegalPageRow,
  type LegalPageVersionRow,
  type LegalSlug,
} from "@/lib/legalPages";

const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

type DraftState = { title: string; body_md: string };

export function AdminLegalEditorView({ slug }: { slug: LegalSlug }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const isAdmin = useMemo(() => Boolean(wallet && ADMIN_LIST.has(wallet)), [wallet]);

  const [page, setPage] = useState<LegalPageRow | null>(null);
  const [versions, setVersions] = useState<LegalPageVersionRow[]>([]);
  const [draft, setDraft] = useState<DraftState>({ title: "", body_md: "" });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!wallet || !isAdmin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/legal?slug=${encodeURIComponent(slug)}`, {
        headers: { "x-nodosol-admin-wallet": wallet },
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { ok: true; page: LegalPageRow | null; versions: LegalPageVersionRow[] }
        | { ok: false; error?: string };
      if (!res.ok || !json.ok) {
        setError("error" in json ? json.error ?? "Load failed" : "Load failed");
        return;
      }
      setPage(json.page);
      setVersions(json.versions);
      if (json.page) {
        setDraft({ title: json.page.title, body_md: json.page.body_md });
      } else {
        const starter = legalStarter(slug);
        setDraft({ title: starter.title, body_md: starter.body_md });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [slug, wallet, isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async () => {
    if (!wallet) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/legal", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-nodosol-admin-wallet": wallet,
        },
        body: JSON.stringify({
          slug,
          title: draft.title,
          body_md: draft.body_md,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; row: LegalPageRow }
        | { ok: false; error?: string };
      if (!res.ok || !json.ok) {
        setError("error" in json ? json.error ?? "Save failed" : "Save failed");
        return;
      }
      setPage(json.row);
      setSavedAt(new Date().toLocaleTimeString());
      // Refresh versions list (the previous row was just archived).
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [slug, draft, wallet, reload]);

  const restoreVersion = useCallback(
    (v: LegalPageVersionRow) => {
      setDraft({ title: v.title, body_md: v.body_md });
    },
    [],
  );

  if (!wallet) {
    return (
      <Centered>
        <h1 style={H1}>Legal page editor</h1>
        <p style={P}>Connect an admin-allowlisted wallet to edit.</p>
        <WalletMultiButton />
      </Centered>
    );
  }
  if (!isAdmin) {
    return (
      <Centered>
        <h1 style={H1}>Not authorized</h1>
        <p style={P}>
          {wallet.slice(0, 4)}…{wallet.slice(-4)} isn&apos;t on the admin allowlist.
        </p>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Link href="/admin/legal" style={BACK}>← All legal pages</Link>
          <h1 style={H1}>
            Editing /{slug}
            {page ? <span style={VERSION_TAG}>v{page.version}</span> : <span style={VERSION_TAG_NEW}>new</span>}
          </h1>
          {page ? (
            <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)", marginTop: "0.25rem" }}>
              Last saved {new Date(page.last_updated).toLocaleString()}
              {page.updated_by_wallet ? ` by ${page.updated_by_wallet.slice(0, 4)}…${page.updated_by_wallet.slice(-4)}` : ""}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href={`/${slug}`} target="_blank" style={SECONDARY}>
            View public
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving || !draft.title.trim() || !draft.body_md.trim()}
            style={{ ...PRIMARY, opacity: saving || !draft.title.trim() ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : page ? "Save new version" : "Publish v1"}
          </button>
        </div>
      </header>

      {error ? <div style={ERROR_BOX}>{error}</div> : null}
      {savedAt ? <div style={INFO_BOX}>Saved at {savedAt}.</div> : null}

      <div style={GRID}>
        <section>
          <label style={LABEL}>
            Title
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={INPUT}
              maxLength={200}
            />
          </label>
          <label style={LABEL}>
            Body (Markdown)
            <textarea
              value={draft.body_md}
              onChange={(e) => setDraft({ ...draft, body_md: e.target.value })}
              style={{ ...TEXTAREA, minHeight: 520 }}
              spellCheck
            />
          </label>
          <div style={HINT}>
            Supported: <code>## h2</code>, <code>### h3</code>, <code>- bullet</code>,{" "}
            <code>1. ordered</code>, <code>**bold**</code>, <code>*italic*</code>,{" "}
            <code>`code`</code>, <code>[link](https://…)</code>. Mailto + relative
            paths allowed in links.
          </div>
        </section>

        <section>
          <div style={LABEL}>Live preview</div>
          <article
            className="nds-legal-prose"
            style={PREVIEW}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body_md) }}
          />
        </section>
      </div>

      {versions.length ? (
        <details style={HISTORY}>
          <summary style={HISTORY_SUMMARY}>Version history ({versions.length})</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {versions.map((v) => (
              <li
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--shell-pill-bg)",
                  border: "1px solid var(--shell-border)",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                }}
              >
                <span>
                  <strong>v{v.version}</strong> · {new Date(v.edited_at).toLocaleString()}
                  {v.edited_by_wallet ? ` · ${v.edited_by_wallet.slice(0, 4)}…${v.edited_by_wallet.slice(-4)}` : ""}
                </span>
                <button type="button" onClick={() => restoreVersion(v)} style={SECONDARY_SM}>
                  Load into editor
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {busy ? <p style={{ color: "var(--shell-muted)", marginTop: "1rem" }}>Loading…</p> : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "4rem 1rem",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

const H1: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 600,
  margin: "0.4rem 0 0",
  color: "var(--shell-fg)",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
};
const P: React.CSSProperties = { color: "var(--shell-muted)", fontSize: "0.9rem", margin: "0.5rem 0" };

const BACK: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
  textDecoration: "none",
};

const VERSION_TAG: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#10b981",
  background: "rgba(16,185,129,0.12)",
  padding: "0.15rem 0.55rem",
  borderRadius: 999,
};

const VERSION_TAG_NEW: React.CSSProperties = {
  ...VERSION_TAG,
  color: "#7b9cff",
  background: "rgba(123,156,255,0.12)",
};

const PRIMARY: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontSize: "0.86rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  textDecoration: "none",
};

const SECONDARY_SM: React.CSSProperties = {
  ...SECONDARY,
  padding: "0.3rem 0.7rem",
  fontSize: "0.78rem",
  cursor: "pointer",
};

const ERROR_BOX: React.CSSProperties = {
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.3)",
  color: "#ef4444",
  padding: "0.75rem 1rem",
  borderRadius: 8,
  marginBottom: "1rem",
  fontSize: "0.85rem",
};

const INFO_BOX: React.CSSProperties = {
  background: "rgba(16,185,129,0.1)",
  border: "1px solid rgba(16,185,129,0.3)",
  color: "#10b981",
  padding: "0.6rem 1rem",
  borderRadius: 8,
  marginBottom: "1rem",
  fontSize: "0.85rem",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "1.25rem",
  alignItems: "start",
};

const LABEL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  marginBottom: "1rem",
  fontSize: "0.82rem",
  color: "var(--shell-muted)",
  fontWeight: 500,
};

const INPUT: React.CSSProperties = {
  background: "var(--shell-input-bg)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.55rem 0.8rem",
  color: "var(--shell-fg)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

const TEXTAREA: React.CSSProperties = {
  ...INPUT,
  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
  fontSize: "0.84rem",
  lineHeight: 1.55,
  resize: "vertical",
};

const PREVIEW: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#e8e8e8",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "1.5rem",
  minHeight: 520,
  overflowY: "auto",
};

const HINT: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
  lineHeight: 1.55,
};

const HISTORY: React.CSSProperties = {
  marginTop: "1.5rem",
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
};

const HISTORY_SUMMARY: React.CSSProperties = {
  cursor: "pointer",
  fontSize: "0.86rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
};
