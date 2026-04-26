"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import {
  AdminProgramSnapshot,
  PROGRAMS,
  ProgramDescriptor,
  configPdaFor,
  loadProgram,
} from "@/lib/admin";
import { simulateAndSend } from "@/lib/tx";
import { explainSolanaError } from "@/lib/solanaErrors";
import { AdminSecurityEventsWidget } from "@/components/AdminSecurityEventsWidget";
import { AdminVolumeWidget } from "@/components/AdminVolumeWidget";
import { useToast } from "@/components/ToastProvider";

const ADMIN_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; snapshots: AdminProgramSnapshot[] }
  | { kind: "error"; message: string };

export function AdminView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();

  const viewerKey = publicKey?.toBase58() ?? null;
  const gate: "connect" | "forbidden" | "ok" = useMemo(() => {
    if (!connected || !viewerKey) return "connect";
    return ADMIN_ALLOWLIST.has(viewerKey) ? "ok" : "forbidden";
  }, [connected, viewerKey]);

  useEffect(() => {
    if (gate === "forbidden") {
      router.replace("/");
    }
  }, [gate, router]);

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editFee, setEditFee] = useState<{ key: string; current: number } | null>(null);
  const [editTreasury, setEditTreasury] = useState<{ key: string } | null>(null);
  const [editAuthority, setEditAuthority] = useState<{ key: string } | null>(null);
  const toast = useToast();

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const snapshots = await Promise.all(
        PROGRAMS.map(async (desc): Promise<AdminProgramSnapshot> => {
          const [configAddress] = configPdaFor(desc.programId);
          try {
            const program = loadProgram(desc, provider);
            const api = (program.account as Record<string, {
              fetchNullable: (addr: PublicKey) => Promise<Record<string, unknown> | null>;
            }>).config;
            const raw = await api.fetchNullable(configAddress);
            if (!raw) {
              return {
                key: desc.key,
                label: desc.label,
                blurb: desc.blurb,
                programId: desc.programId.toBase58(),
                configAddress: configAddress.toBase58(),
                deployed: false,
                authority: null,
                treasury: null,
                feeBps: null,
                treasuryBalanceUsdc: null,
                issuerCount: null,
              };
            }

            const authorityPk = raw.authority as PublicKey;
            let treasuryAddress: string | null = null;
            let feeBps: number | null = null;
            let treasuryBalance: number | null = null;
            let issuerCount: number | null = null;

            if (desc.hasFee) {
              treasuryAddress = (raw.treasury as PublicKey).toBase58();
              feeBps = raw.feeBps as number;
              try {
                const bal = await connection.getTokenAccountBalance(
                  raw.treasury as PublicKey,
                  "confirmed"
                );
                treasuryBalance = Number(bal.value.uiAmountString ?? 0);
              } catch {
                treasuryBalance = null;
              }
            }

            if (desc.key === "rwa_registry") {
              const rawIc = raw.issuerCount;
              if (rawIc && typeof (rawIc as BN).toNumber === "function") {
                issuerCount = (rawIc as BN).toNumber();
              }
            }

            return {
              key: desc.key,
              label: desc.label,
              blurb: desc.blurb,
              programId: desc.programId.toBase58(),
              configAddress: configAddress.toBase58(),
              deployed: true,
              authority: authorityPk.toBase58(),
              treasury: treasuryAddress,
              feeBps,
              treasuryBalanceUsdc: treasuryBalance,
              issuerCount,
            };
          } catch (err) {
            console.warn(`${desc.key}: fetch failed`, err);
            return {
              key: desc.key,
              label: desc.label,
              blurb: desc.blurb,
              programId: desc.programId.toBase58(),
              configAddress: configAddress.toBase58(),
              deployed: false,
              authority: null,
              treasury: null,
              feeBps: null,
              treasuryBalanceUsdc: null,
              issuerCount: null,
            };
          }
        })
      );
      setState({ kind: "ready", snapshots });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, wallet]);

  useEffect(() => {
    if (gate !== "ok") return;
    void reload();
  }, [reload, gate]);

  async function runAdminTx(
    descriptorKey: string,
    build: (
      program: ReturnType<typeof loadProgram>,
      descriptor: ProgramDescriptor,
      provider: AnchorProvider
    ) => Promise<{ ix: Parameters<Transaction["add"]>[0]; extraSigners?: never[] }>
  ) {
    const desc = PROGRAMS.find((p) => p.key === descriptorKey);
    if (!desc || !publicKey) return;
    setBusyKey(descriptorKey);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = loadProgram(desc, provider);
      const { ix } = await build(program, desc, provider);
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [ix as TransactionInstruction],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitFeeChange(snapshot: AdminProgramSnapshot, newFeeBps: number) {
    await runAdminTx(snapshot.key, async (program) => {
      const ix = await program.methods
        .updateFeeBps(newFeeBps)
        .accounts({
          authority: publicKey!,
          config: new PublicKey(snapshot.configAddress),
        })
        .instruction();
      return { ix };
    });
    setEditFee(null);
  }

  async function submitTreasuryChange(snapshot: AdminProgramSnapshot, newTreasury: PublicKey) {
    await runAdminTx(snapshot.key, async (program) => {
      const ix = await program.methods
        .updateTreasury()
        .accounts({
          authority: publicKey!,
          config: new PublicKey(snapshot.configAddress),
          newTreasury,
        })
        .instruction();
      return { ix };
    });
    setEditTreasury(null);
  }

  async function submitAuthorityChange(snapshot: AdminProgramSnapshot, newAuthority: PublicKey) {
    // rwa_registry uses update_registry_authority; others use update_config_authority.
    const method = snapshot.key === "rwa_registry" ? "updateRegistryAuthority" : "updateConfigAuthority";
    await runAdminTx(snapshot.key, async (program) => {
      const ix = await (program.methods as any)
        [method]()
        .accounts({
          authority: publicKey!,
          config: new PublicKey(snapshot.configAddress),
          newAuthority,
        })
        .instruction();
      return { ix };
    });
    setEditAuthority(null);
  }

  if (gate === "connect") {
    return (
      <CenteredCard>
        <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--shell-fg)", marginBottom: "0.4rem" }}>
          Admin access
        </div>
        <p style={{ marginBottom: "1.1rem" }}>
          Connect a wallet on the admin allowlist to continue.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <WalletMultiButton />
        </div>
      </CenteredCard>
    );
  }

  if (gate === "forbidden") {
    return (
      <CenteredCard>
        <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--shell-fg)", marginBottom: "0.4rem" }}>
          403 — Forbidden
        </div>
        <p>This wallet is not on the admin allowlist. Redirecting…</p>
      </CenteredCard>
    );
  }

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Program configs
          </h1>
          <p style={{ color: "var(--shell-muted)", fontSize: "0.9rem" }}>
            Authority, treasury, and fee bps for each Anchor program. Only the listed authority wallet can mutate; everyone can read.
          </p>
        </div>
        {!connected ? <WalletMultiButton /> : null}
      </header>

      <AdminVolumeWidget />

      <AdminSecurityEventsWidget />

      {state.kind === "loading" || state.kind === "idle" ? (
        <CenteredCard>Loading configs…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {state.snapshots.map((s) => (
            <ProgramRow
              key={s.key}
              snapshot={s}
              viewerPubkey={publicKey?.toBase58() ?? null}
              busy={busyKey === s.key}
              onEditFee={() => setEditFee({ key: s.key, current: s.feeBps ?? 0 })}
              onEditTreasury={() => setEditTreasury({ key: s.key })}
              onEditAuthority={() => setEditAuthority({ key: s.key })}
            />
          ))}
        </div>
      )}

      {editFee && state.kind === "ready" ? (
        <FeeModal
          snapshot={state.snapshots.find((s) => s.key === editFee.key)!}
          onClose={() => setEditFee(null)}
          onSubmit={async (bps) => {
            await submitFeeChange(
              state.snapshots.find((s) => s.key === editFee.key)!,
              bps
            );
          }}
        />
      ) : null}

      {editTreasury && state.kind === "ready" ? (
        <PubkeyModal
          title="Update treasury"
          description={`New treasury token account for ${PROGRAMS.find((p) => p.key === editTreasury.key)?.label}. Must be an existing USDC token account you control.`}
          onClose={() => setEditTreasury(null)}
          onSubmit={async (pk) => {
            await submitTreasuryChange(
              state.snapshots.find((s) => s.key === editTreasury.key)!,
              pk
            );
          }}
        />
      ) : null}

      {editAuthority && state.kind === "ready" ? (
        <PubkeyModal
          title="Transfer authority"
          description={`Transfers admin of ${PROGRAMS.find((p) => p.key === editAuthority.key)?.label} to a new wallet. This is IRREVERSIBLE by this authority — only the new authority can transfer it back.`}
          destructive
          onClose={() => setEditAuthority(null)}
          onSubmit={async (pk) => {
            await submitAuthorityChange(
              state.snapshots.find((s) => s.key === editAuthority.key)!,
              pk
            );
          }}
        />
      ) : null}
    </>
  );
}

function ProgramRow({
  snapshot,
  viewerPubkey,
  busy,
  onEditFee,
  onEditTreasury,
  onEditAuthority,
}: {
  snapshot: AdminProgramSnapshot;
  viewerPubkey: string | null;
  busy: boolean;
  onEditFee: () => void;
  onEditTreasury: () => void;
  onEditAuthority: () => void;
}) {
  const isAuthority = viewerPubkey !== null && snapshot.authority === viewerPubkey;
  const hasFee = snapshot.feeBps !== null;
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
            <h3 style={{ fontSize: "1.02rem", fontWeight: 600 }}>{snapshot.label}</h3>
            {!snapshot.deployed ? (
              <span style={{ fontSize: "0.7rem", color: "#b45309", background: "rgba(245,158,11,0.12)", padding: "0.18rem 0.5rem", borderRadius: 4, fontWeight: 600 }}>
                Not initialised
              </span>
            ) : isAuthority ? (
              <span style={{ fontSize: "0.7rem", color: "#059669", background: "rgba(16,185,129,0.12)", padding: "0.18rem 0.5rem", borderRadius: 4, fontWeight: 600 }}>
                You are the authority
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--shell-muted)" }}>{snapshot.blurb}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {hasFee ? (
            <>
              <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{(snapshot.feeBps! / 100).toFixed(2)}%</div>
              <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)" }}>platform fee</div>
            </>
          ) : snapshot.issuerCount !== null ? (
            <>
              <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{snapshot.issuerCount}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)" }}>issuers</div>
            </>
          ) : (
            <div style={{ fontSize: "0.72rem", color: "var(--shell-faint)" }}>—</div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: snapshot.deployed && isAuthority ? "0.9rem" : "0" }}>
        <MiniStat label="Program" value={shorten(snapshot.programId)} mono copy={snapshot.programId} />
        <MiniStat label="Config PDA" value={shorten(snapshot.configAddress)} mono copy={snapshot.configAddress} />
        <MiniStat
          label="Authority"
          value={snapshot.authority ? shorten(snapshot.authority) : "—"}
          mono={snapshot.authority !== null}
          copy={snapshot.authority ?? undefined}
        />
      </div>

      {hasFee && snapshot.deployed ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: isAuthority ? "0.9rem" : "0" }}>
          <MiniStat
            label="Treasury"
            value={snapshot.treasury ? shorten(snapshot.treasury) : "—"}
            mono={snapshot.treasury !== null}
            copy={snapshot.treasury ?? undefined}
          />
          <MiniStat
            label="Treasury balance"
            value={snapshot.treasuryBalanceUsdc !== null ? `$${snapshot.treasuryBalanceUsdc.toFixed(2)} USDC` : "—"}
          />
        </div>
      ) : null}

      {snapshot.deployed && isAuthority ? (
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          {hasFee ? (
            <>
              <button style={btnSecondary} onClick={onEditFee} disabled={busy}>
                Edit fee bps
              </button>
              <button style={btnSecondary} onClick={onEditTreasury} disabled={busy}>
                Edit treasury
              </button>
            </>
          ) : null}
          <button style={btnSecondary} onClick={onEditAuthority} disabled={busy}>
            Transfer authority
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeeModal({
  snapshot,
  onClose,
  onSubmit,
}: {
  snapshot: AdminProgramSnapshot;
  onClose: () => void;
  onSubmit: (bps: number) => Promise<void>;
}) {
  const [pct, setPct] = useState(((snapshot.feeBps ?? 0) / 100).toString());
  const [submitting, setSubmitting] = useState(false);
  const pctNum = Number(pct);
  const bps = Math.round(pctNum * 100);
  const canSubmit = !submitting && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 10;

  return (
    <ModalShell onClose={onClose}>
      <h3 style={modalTitle}>Update fee for {snapshot.label}</h3>
      <p style={modalBlurb}>
        Platform takes a percentage of every payment routed through the program. Max 10%. Applies going forward; existing balances in treasury are untouched.
      </p>
      <Label>New fee (%)</Label>
      <input
        type="number"
        min={0}
        max={10}
        step="0.01"
        style={input}
        value={pct}
        onChange={(e) => setPct(e.target.value)}
      />
      <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)", marginTop: "0.45rem" }}>
        = {bps} bps (was {snapshot.feeBps} bps)
      </div>
      <ModalActions
        onClose={onClose}
        submitting={submitting}
        canSubmit={canSubmit}
        label="Update fee"
        onSubmit={async () => {
          if (!canSubmit) return;
          setSubmitting(true);
          try {
            await onSubmit(bps);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </ModalShell>
  );
}

function PubkeyModal({
  title,
  description,
  destructive,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (pk: PublicKey) => Promise<void>;
}) {
  const [val, setVal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  let parsed: PublicKey | null = null;
  try {
    parsed = val.trim().length >= 32 ? new PublicKey(val.trim()) : null;
  } catch {
    parsed = null;
  }
  const canSubmit = !submitting && parsed !== null;
  return (
    <ModalShell onClose={onClose}>
      <h3 style={modalTitle}>{title}</h3>
      <p style={modalBlurb}>{description}</p>
      <Label>Solana address</Label>
      <input style={input} value={val} onChange={(e) => setVal(e.target.value.trim())} placeholder="Paste a base58 pubkey" />
      {val && !parsed ? (
        <div style={{ fontSize: "0.78rem", color: "#b91c1c", marginTop: "0.4rem" }}>Invalid base58 address</div>
      ) : null}
      <ModalActions
        onClose={onClose}
        submitting={submitting}
        canSubmit={canSubmit}
        label={destructive ? "Transfer" : "Save"}
        destructive={destructive}
        onSubmit={async () => {
          if (!canSubmit || !parsed) return;
          setSubmitting(true);
          try {
            await onSubmit(parsed);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </ModalShell>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--shell-card)",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
          width: 440,
          maxWidth: "92vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  submitting,
  canSubmit,
  label,
  onSubmit,
  destructive,
}: {
  onClose: () => void;
  submitting: boolean;
  canSubmit: boolean;
  label: string;
  onSubmit: () => void;
  destructive?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
      <button style={btnSecondary} onClick={onClose} disabled={submitting}>
        Cancel
      </button>
      <button
        style={{
          ...(destructive ? btnDestructive : btnPrimary),
          opacity: canSubmit ? 1 : 0.55,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
        onClick={onSubmit}
        disabled={!canSubmit}
      >
        {submitting ? "Submitting…" : label}
      </button>
    </div>
  );
}

function MiniStat({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "var(--shell-pill-bg)", border: "1px solid var(--shell-border)", borderRadius: 8, padding: "0.55rem 0.75rem" }}>
      <div style={{ fontSize: "0.68rem", color: "var(--shell-muted)", marginBottom: "0.15rem", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
        <div
          style={{
            fontSize: mono ? "0.8rem" : "0.92rem",
            fontWeight: mono ? 500 : 600,
            color: "var(--shell-fg)",
            fontFamily: mono ? "'SF Mono', Menlo, monospace" : "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
        {copy ? (
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copy);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {
                // ignore
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--shell-muted)",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: "0.15rem 0.3rem",
            }}
          >
            {copied ? "✓" : "Copy"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "var(--shell-muted)",
      }}
    >
      {children}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "var(--shell-fg)", fontWeight: 500, marginBottom: "0.3rem" }}>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 8,
  color: "var(--shell-fg)",
  padding: "0.6rem 0.8rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.55rem 1.2rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnDestructive: React.CSSProperties = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: "0.55rem 1.2rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  border: "1px solid var(--shell-border-strong)",
  padding: "0.55rem 1rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const modalTitle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
};

const modalBlurb: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  marginBottom: "1.1rem",
};

// Suppress unused import warning while maintaining imports for future use.
const _unused = { USDC_UNIT };
void _unused;
