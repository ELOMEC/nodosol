"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { REGIONS, type Country } from "@/lib/countryList";

const ADMIN_LIST = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

type LoadResponse =
  | { ok: true; countries: string[]; source: "edge-config" | "env" }
  | { ok: false; error?: string };

type SaveResponse =
  | { ok: true; countries: string[]; note?: string }
  | { ok: false; error?: string };

export function GeoBlockView() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const isAdmin = useMemo(() => Boolean(wallet && ADMIN_LIST.has(wallet)), [wallet]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<"edge-config" | "env" | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!wallet || !isAdmin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/geo-block", {
        headers: { "x-nodosol-admin-wallet": wallet },
        cache: "no-store",
      });
      const json = (await res.json()) as LoadResponse;
      if (!res.ok || !json.ok) {
        setError("error" in json ? json.error ?? "Load failed" : "Load failed");
        return;
      }
      const set = new Set(json.countries);
      setSelected(set);
      setOriginal(new Set(set));
      setSource(json.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [wallet, isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setInfo(null);
  };

  const dirty = useMemo(() => {
    if (selected.size !== original.size) return true;
    for (const c of selected) if (!original.has(c)) return true;
    return false;
  }, [selected, original]);

  const save = useCallback(async () => {
    if (!wallet) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/geo-block", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-nodosol-admin-wallet": wallet,
        },
        body: JSON.stringify({ countries: Array.from(selected) }),
      });
      const json = (await res.json()) as SaveResponse;
      if (!res.ok || !json.ok) {
        setError("error" in json ? json.error ?? "Save failed" : "Save failed");
        return;
      }
      setOriginal(new Set(json.countries));
      setSelected(new Set(json.countries));
      setSource("edge-config");
      setInfo(json.note ?? "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [wallet, selected]);

  const reset = useCallback(() => {
    setSelected(new Set(original));
    setInfo(null);
  }, [original]);

  if (!wallet) {
    return (
      <Centered>
        <h1 style={H1}>Geo-block admin</h1>
        <p style={P}>Connect an admin-allowlisted wallet to manage the country blocklist.</p>
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

  const q = filter.trim().toUpperCase();
  const matchesFilter = (c: Country) =>
    !q || c.code.includes(q) || c.name.toUpperCase().includes(q);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={H1}>Geo-block</h1>
        <p style={P}>
          Visitors from selected countries are served the 451 page at{" "}
          <code>/blocked/[country]</code> via Vercel Edge middleware. Changes
          propagate to all edge POPs in ~60 seconds; refresh in a private window
          to verify.
        </p>
        {source === "env" ? (
          <div style={WARN_BOX}>
            Edge Config not yet configured — the middleware is currently reading
            from <code>GEO_BLOCK_COUNTRIES</code> env var. Saving here will
            populate Edge Config; from that moment on, env var is just a
            fallback. See <code>docs/GEO_BLOCK_ADMIN.md</code>.
          </div>
        ) : null}
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or ISO code…"
          style={INPUT}
        />
        <span style={{ fontSize: "0.86rem", color: "var(--shell-muted)" }}>
          {selected.size} selected
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={reset} disabled={!dirty || saving} style={SECONDARY}>
          Reset
        </button>
        <button type="button" onClick={save} disabled={!dirty || saving} style={PRIMARY}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? <div style={ERROR_BOX}>{error}</div> : null}
      {info ? <div style={INFO_BOX}>{info}</div> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {REGIONS.map((region) => {
          const visible = region.countries.filter(matchesFilter);
          if (!visible.length) return null;
          return (
            <section key={region.name}>
              <h2 style={REGION_H}>{region.name}</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "0.4rem",
                }}
              >
                {visible.map((c) => {
                  const on = selected.has(c.code);
                  return (
                    <label
                      key={c.code}
                      style={{
                        ...CHECK,
                        background: on ? "rgba(239,68,68,0.08)" : "var(--shell-card)",
                        borderColor: on ? "rgba(239,68,68,0.4)" : "var(--shell-border)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.code)}
                        style={{ accentColor: "#ef4444" }}
                      />
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <span style={{ marginLeft: "auto", color: "var(--shell-faint)", fontFamily: "'SF Mono', Menlo, monospace", fontSize: "0.8rem" }}>
                        {c.code}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

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

const H1: React.CSSProperties = { fontSize: "1.5rem", fontWeight: 600, margin: 0, color: "var(--shell-fg)" };
const P: React.CSSProperties = { color: "var(--shell-muted)", fontSize: "0.9rem", margin: "0.5rem 0" };

const REGION_H: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  color: "var(--shell-faint)",
  margin: "0 0 0.55rem",
};

const CHECK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const INPUT: React.CSSProperties = {
  background: "var(--shell-input-bg)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 0.8rem",
  color: "var(--shell-fg)",
  fontSize: "0.9rem",
  fontFamily: "inherit",
  flex: "0 1 320px",
};

const PRIMARY: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
  opacity: 1,
};

const SECONDARY: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
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

const WARN_BOX: React.CSSProperties = {
  background: "rgba(245,158,11,0.1)",
  border: "1px solid rgba(245,158,11,0.3)",
  color: "#f59e0b",
  padding: "0.65rem 0.9rem",
  borderRadius: 8,
  marginTop: "0.75rem",
  fontSize: "0.82rem",
  lineHeight: 1.5,
};
