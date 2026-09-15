"use client";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { earningsToCsv, fetchEarnings } from "@/lib/earnings";
import {
  CreatorProfileDoc,
  creatorProfilePda,
  fetchCreatorProfile,
  tipJarProgram,
} from "@/lib/tipJar";
import { useToast } from "@/components/ToastProvider";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "nodosol:analytics:v1";
const SIG_LIMIT = 1000;
const CHART_DAYS = 30;
const RECENT_LIMIT = 20;

type CachedSnapshot = {
  wallet: string;
  fetchedAt: number;
  profile: SerialisedProfile | null;
  signatures: SerialisedSig[];
  vaultBalance: number;
};

type SerialisedProfile = {
  ownerPubkey: string;
  vaultPubkey: string;
  totalTipCount: number;
  totalTipsAmountRaw: string; // BN as string, divide by USDC_UNIT
  totalWithdrawnRaw: string;
  createdAt: number;
};

type SerialisedSig = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
};

function readCache(wallet: string): CachedSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY}:${wallet}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshot;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshot: CachedSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${CACHE_KEY}:${snapshot.wallet}`,
      JSON.stringify(snapshot),
    );
  } catch {
    // quota or private mode — ignore
  }
}

export function AnalyticsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const toast = useToast();

  const [snapshot, setSnapshot] = useState<CachedSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [earningsBusy, setEarningsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletStr = publicKey?.toBase58() ?? null;

  const loadFromChain = useCallback(async () => {
    if (!publicKey || !walletStr) return;
    setBusy(true);
    setError(null);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = tipJarProgram(provider);
      const profileDoc = await fetchCreatorProfile(program, publicKey);

      let serialisedProfile: SerialisedProfile | null = null;
      let vaultBalance = 0;
      let pda: PublicKey | null = null;

      if (profileDoc) {
        pda = creatorProfilePda(publicKey)[0];
        serialisedProfile = serialiseProfile(profileDoc);
        try {
          const info = await connection.getTokenAccountBalance(profileDoc.vault, "confirmed");
          vaultBalance = Number(info.value.uiAmountString ?? 0);
        } catch {
          vaultBalance = 0;
        }
      } else {
        pda = creatorProfilePda(publicKey)[0];
      }

      let sigs: ConfirmedSignatureInfo[] = [];
      try {
        sigs = await connection.getSignaturesForAddress(pda, { limit: SIG_LIMIT });
      } catch (err) {
        console.warn("getSignaturesForAddress failed", err);
      }

      const next: CachedSnapshot = {
        wallet: walletStr,
        fetchedAt: Date.now(),
        profile: serialisedProfile,
        signatures: sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          err: s.err !== null,
        })),
        vaultBalance,
      };
      writeCache(next);
      setSnapshot(next);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setBusy(false);
    }
  }, [publicKey, walletStr, connection, wallet]);

  // On wallet change, try cache first, fall back to fetch.
  useEffect(() => {
    if (!connected || !walletStr) {
      setSnapshot(null);
      return;
    }
    const cached = readCache(walletStr);
    if (cached) {
      setSnapshot(cached);
    } else {
      void loadFromChain();
    }
  }, [connected, walletStr, loadFromChain]);

  const dailyBuckets = useMemo(() => {
    if (!snapshot) return [] as DailyBucket[];
    return bucketLastNDays(snapshot.signatures, CHART_DAYS);
  }, [snapshot]);

  const recent = useMemo(() => {
    if (!snapshot) return [] as SerialisedSig[];
    return snapshot.signatures.slice(0, RECENT_LIMIT);
  }, [snapshot]);

  async function exportEarnings() {
    if (!walletStr || !publicKey) return;
    setEarningsBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const rows = await fetchEarnings(provider, walletStr);
      if (rows.length === 0) {
        toast.info("No on-chain earnings yet");
        return;
      }
      const csv = earningsToCsv(rows);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nodosol-earnings-${walletStr.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} earnings row${rows.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Earnings export failed");
    } finally {
      setEarningsBusy(false);
    }
  }

  function exportCsv() {
    if (!snapshot || !walletStr) return;
    const header = "iso_timestamp,signature,slot,status\n";
    const body = snapshot.signatures
      .map((s) => {
        const iso = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : "";
        const status = s.err ? "FAILED" : "OK";
        return [iso, s.signature, s.slot, status].join(",");
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nodosol-analytics-${walletStr.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${snapshot.signatures.length} rows`);
  }

  if (!connected || !walletStr) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Analytics</h1>
        <p style={SUB}>Connect a wallet to see your tip jar volume + history.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const profile = snapshot?.profile;
  const lifetimeAmount = profile
    ? Number(profile.totalTipsAmountRaw) / Number(USDC_UNIT)
    : 0;
  const withdrawn = profile
    ? Number(profile.totalWithdrawnRaw) / Number(USDC_UNIT)
    : 0;

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Analytics</h1>
          <p style={SUB}>
            On-chain activity for your tip jar. Cached locally for 5 minutes
            per wallet to keep RPC chatty kept down.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.55rem" }}>
          <button
            type="button"
            onClick={() => void loadFromChain()}
            disabled={busy}
            style={SECONDARY_BTN}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!snapshot || snapshot.signatures.length === 0}
            style={SECONDARY_BTN}
          >
            Export signatures
          </button>
          <button
            type="button"
            onClick={() => void exportEarnings()}
            disabled={earningsBusy}
            style={PRIMARY_BTN}
          >
            {earningsBusy ? "Building…" : "Export earnings"}
          </button>
        </div>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      {!profile ? (
        <div style={CARD}>
          <h2 style={H2}>No tip jar yet</h2>
          <p style={CARD_SUB}>
            Initialise your creator profile from{" "}
            <a href="/creator/tips" style={LINK}>Creator → Tip jar</a>{" "}
            to start collecting tips. Once tips arrive, this dashboard fills
            in automatically.
          </p>
        </div>
      ) : (
        <>
          <div style={STAT_GRID}>
            <Stat label="Lifetime tips" value={profile.totalTipCount.toLocaleString()} />
            <Stat label="Lifetime USDC" value={lifetimeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Stat label="Vault USDC" value={(snapshot?.vaultBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Stat label="Withdrawn" value={withdrawn.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          </div>

          <section style={CARD}>
            <header style={CARD_HEAD}>
              <h2 style={H2}>Activity (last {CHART_DAYS} days)</h2>
              <span style={CARD_HINT}>
                {snapshot ? `${snapshot.signatures.length} txs scanned` : ""}
              </span>
            </header>
            {dailyBuckets.length === 0 ? (
              <p style={CARD_SUB}>No on-chain activity yet.</p>
            ) : (
              <SparkBars buckets={dailyBuckets} />
            )}
          </section>

          <section style={CARD}>
            <header style={CARD_HEAD}>
              <h2 style={H2}>Recent transactions</h2>
              <span style={CARD_HINT}>
                Top {Math.min(RECENT_LIMIT, recent.length)} most recent
              </span>
            </header>
            {recent.length === 0 ? (
              <p style={CARD_SUB}>No transactions to show.</p>
            ) : (
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>When</th>
                    <th style={TH}>Signature</th>
                    <th style={{ ...TH, textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.signature}>
                      <td style={TD}>
                        {s.blockTime
                          ? new Date(s.blockTime * 1000).toLocaleString()
                          : `slot ${s.slot}`}
                      </td>
                      <td style={TD}>
                        <a
                          href={`https://explorer.solana.com/tx/${s.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          style={LINK}
                        >
                          {s.signature.slice(0, 8)}…{s.signature.slice(-6)}
                        </a>
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        <span style={s.err ? STATUS_ERR : STATUS_OK}>
                          {s.err ? "FAILED" : "OK"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p style={NOTE}>
            <strong>Top tippers</strong> needs per-tx fee payer extraction
            (~1 RPC call per tip). For a 1000-tip jar that's 1000 calls;
            we&apos;ll wire it to the Helius enhanced API in a follow-up
            so the cost stays bounded.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={STAT_TILE}>
      <div style={STAT_LABEL}>{label}</div>
      <div style={STAT_VALUE}>{value}</div>
    </div>
  );
}

type DailyBucket = { dayLabel: string; isoDay: string; count: number };

function bucketLastNDays(sigs: SerialisedSig[], days: number): DailyBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: DailyBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      dayLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      isoDay: d.toISOString().slice(0, 10),
      count: 0,
    });
  }
  const indexByIso = new Map<string, number>();
  buckets.forEach((b, i) => indexByIso.set(b.isoDay, i));

  for (const s of sigs) {
    if (!s.blockTime) continue;
    const iso = new Date(s.blockTime * 1000).toISOString().slice(0, 10);
    const idx = indexByIso.get(iso);
    if (idx !== undefined) buckets[idx].count++;
  }
  return buckets;
}

function SparkBars({ buckets }: { buckets: DailyBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div style={CHART_WRAP}>
      <div style={CHART_BARS}>
        {buckets.map((b) => {
          const pct = (b.count / max) * 100;
          return (
            <div
              key={b.isoDay}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 0", minWidth: 0 }}
              title={`${b.dayLabel}: ${b.count} tx${b.count === 1 ? "" : "s"}`}
            >
              <div style={BAR_TRACK}>
                <div
                  style={{
                    ...BAR_FILL,
                    height: `${pct}%`,
                    opacity: b.count > 0 ? 1 : 0.18,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={CHART_LABELS}>
        <span>{buckets[0]?.dayLabel}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.dayLabel}</span>
        <span>{buckets[buckets.length - 1]?.dayLabel}</span>
      </div>
    </div>
  );
}

function serialiseProfile(p: CreatorProfileDoc): SerialisedProfile {
  return {
    ownerPubkey: p.owner.toBase58(),
    vaultPubkey: p.vault.toBase58(),
    totalTipCount: Number(p.totalTipCount?.toString?.() ?? 0),
    totalTipsAmountRaw: p.totalTipsAmount?.toString?.() ?? "0",
    totalWithdrawnRaw: p.totalWithdrawnAmount?.toString?.() ?? "0",
    createdAt: Number(p.createdAt?.toString?.() ?? 0),
  };
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

const STAT_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.7rem",
  marginBottom: "1.25rem",
};

const STAT_TILE: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 10,
  padding: "0.85rem 1rem",
  background: "var(--shell-card-bg)",
};

const STAT_LABEL: React.CSSProperties = {
  fontSize: "0.72rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--shell-muted)",
  marginBottom: "0.35rem",
};

const STAT_VALUE: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
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

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  lineHeight: 1.5,
};

const CARD_HINT: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-faint)",
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

const TABLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.84rem",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--shell-faint)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
};

const TD: React.CSSProperties = {
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  color: "var(--shell-fg)",
};

const STATUS_OK: React.CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.68rem",
  fontWeight: 600,
  background: "rgba(16,185,129,0.12)",
  color: "#059669",
};

const STATUS_ERR: React.CSSProperties = {
  display: "inline-block",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.68rem",
  fontWeight: 600,
  background: "rgba(239,68,68,0.12)",
  color: "#b91c1c",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "var(--shell-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const NOTE: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-faint)",
  marginTop: "1rem",
  lineHeight: 1.5,
  maxWidth: 620,
};

const CHART_WRAP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const CHART_BARS: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "2px",
  height: 120,
};

const BAR_TRACK: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "flex-end",
  background: "transparent",
};

const BAR_FILL: React.CSSProperties = {
  width: "100%",
  background: "linear-gradient(180deg, #7c5cff 0%, #6366f1 100%)",
  borderRadius: "2px 2px 0 0",
  minHeight: "1px",
  transition: "height 0.15s",
};

const CHART_LABELS: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.7rem",
  color: "var(--shell-faint)",
};
