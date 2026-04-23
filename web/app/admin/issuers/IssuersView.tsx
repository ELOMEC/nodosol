"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ASSET_CLASS_FLAGS,
  assetClassLabels,
  decodeIssuerStatus,
  issuerPda,
  IssuerStatusKey,
  jurisdictionsToString,
  registryProgram,
} from "@/lib/rwa";
import { simulateAndSend } from "@/lib/tx";
import { explainSolanaError } from "@/lib/solanaErrors";
import { useToast } from "@/components/ToastProvider";

type IssuerRow = {
  address: string;
  owner: string;
  status: IssuerStatusKey;
  jurisdictions: string[];
  assetClasses: number;
  kycRef: string;
  registeredAt: number;
  updatedAt: number;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; issuers: IssuerRow[]; config: { authority: string; issuerCount: number } | null }
  | { kind: "error"; message: string };

const CONFIG_SEED = Buffer.from("config");

export function IssuersView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editMetadata, setEditMetadata] = useState<IssuerRow | null>(null);
  const toast = useToast();

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = registryProgram(provider);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);

      const configApi = (program.account as Record<string, {
        fetchNullable: (addr: PublicKey) => Promise<{
          authority: PublicKey;
          issuerCount: BN;
        } | null>;
      }>).registryConfig;
      const cfg = await configApi.fetchNullable(configPda);

      const issuerApi = (program.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
            owner: PublicKey;
            status: Record<string, unknown>;
            jurisdictions: number[][];
            assetClasses: number;
            kycRef: string;
            registeredAt: BN;
            updatedAt: BN;
          };
        }>>;
      }>).issuer;
      const items = await issuerApi.all();
      const issuers: IssuerRow[] = items
        .map(({ publicKey: addr, account }) => ({
          address: addr.toBase58(),
          owner: account.owner.toBase58(),
          status: decodeIssuerStatus(account.status),
          jurisdictions: jurisdictionsToString(account.jurisdictions),
          assetClasses: account.assetClasses,
          kycRef: account.kycRef,
          registeredAt: account.registeredAt.toNumber(),
          updatedAt: account.updatedAt.toNumber(),
        }))
        .sort((a, b) => b.registeredAt - a.registeredAt);

      setState({
        kind: "ready",
        issuers,
        config: cfg
          ? { authority: cfg.authority.toBase58(), issuerCount: cfg.issuerCount.toNumber() }
          : null,
      });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, wallet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function registerIssuer(form: {
    ownerPubkey: string;
    jurisdictions: string[];
    assetClassBitmap: number;
    kycRef: string;
    initialStatus: IssuerStatusKey;
  }) {
    if (!publicKey) return;
    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = registryProgram(provider);
    const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
    const owner = new PublicKey(form.ownerPubkey);
    const [issuer] = issuerPda(owner);

    const jurisdictionArrays = form.jurisdictions.map((j) => {
      const padded = j.toUpperCase().padEnd(3, " ").slice(0, 3);
      return Array.from(Buffer.from(padded));
    });
    const variant = { [form.initialStatus]: {} } as never;

    const ix = await program.methods
      .registerIssuer(
        owner,
        jurisdictionArrays,
        form.assetClassBitmap,
        form.kycRef,
        variant
      )
      .accounts({
        authority: publicKey,
        config: configPda,
        issuer,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const sig = await simulateAndSend(connection, wallet, {
      feePayer: publicKey,
      instructions: [
      ix,
    ],
    });
    await reload();
  }

  async function transitionStatus(row: IssuerRow, next: IssuerStatusKey) {
    if (!publicKey) return;
    setBusyRow(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = registryProgram(provider);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
      const variant = { [next]: {} } as never;
      const ix = await program.methods
        .updateIssuerStatus(variant)
        .accounts({
          authority: publicKey,
          config: configPda,
          issuer: new PublicKey(row.address),
        })
        .instruction();
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyRow(null);
    }
  }

  async function submitMetadataUpdate(
    row: IssuerRow,
    jurisdictions: string[],
    assetClassBitmap: number,
    kycRef: string
  ) {
    if (!publicKey) return;
    setBusyRow(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = registryProgram(provider);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);

      const jurisdictionArrays = jurisdictions.map((j) => {
        const padded = j.toUpperCase().padEnd(3, " ").slice(0, 3);
        return Array.from(Buffer.from(padded));
      });

      const ix = await program.methods
        .updateIssuerMetadata(jurisdictionArrays, assetClassBitmap, kycRef)
        .accounts({
          authority: publicKey,
          config: configPda,
          issuer: new PublicKey(row.address),
        })
        .instruction();
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyRow(null);
    }
  }

  async function closeIssuer(row: IssuerRow) {
    if (!publicKey) return;
    if (!window.confirm(`Close issuer ${shorten(row.owner)}? Requires Revoked status; frees rent to you.`)) return;
    setBusyRow(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = registryProgram(provider);
      const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
      const ix = await program.methods
        .closeIssuer()
        .accounts({
          authority: publicKey,
          config: configPda,
          issuer: new PublicKey(row.address),
        })
        .instruction();
      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyRow(null);
    }
  }

  const isAuthority = useMemo(() => {
    if (state.kind !== "ready" || !state.config || !publicKey) return false;
    return state.config.authority === publicKey.toBase58();
  }, [state, publicKey]);

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Issuer registry
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Licenced RWA issuers tracked on-chain. Only the registry authority can register, suspend, revoke, or edit metadata. Everyone can read.
          </p>
        </div>
        {connected && isAuthority ? (
          <button
            onClick={() => setRegisterOpen(true)}
            style={{
              background: "#4f46e5",
              color: "#fff",
              padding: "0.6rem 1.15rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            + Register issuer
          </button>
        ) : !connected ? (
          <WalletMultiButton />
        ) : null}
      </header>

      {state.kind === "loading" || state.kind === "idle" ? (
        <CenteredCard>Loading issuers…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <StatCard label="Total issuers" value={state.config?.issuerCount?.toString() ?? state.issuers.length.toString()} sub="Registered on-chain" />
            <StatCard label="Active" value={state.issuers.filter((i) => i.status === "active").length.toString()} sub="Can mint RWA" />
            <StatCard label="Suspended" value={state.issuers.filter((i) => i.status === "suspended").length.toString()} sub="Temporarily blocked" />
            <StatCard label="Revoked" value={state.issuers.filter((i) => i.status === "revoked").length.toString()} sub="Terminal — close to reclaim rent" />
          </div>

          {state.config && publicKey && !isAuthority ? (
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                borderRadius: 10,
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                fontSize: "0.85rem",
                color: "#92400e",
              }}
            >
              You can view issuers but not edit — registry authority is{" "}
              <code style={code}>{shorten(state.config.authority)}</code>.
            </div>
          ) : null}

          {state.issuers.length === 0 ? (
            <CenteredCard>
              <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
                No issuers registered yet
              </div>
              <div style={{ fontSize: "0.88rem", color: "#6b7280" }}>
                {isAuthority
                  ? "Click Register issuer above to add the first."
                  : "Waiting for the registry authority to add issuers."}
              </div>
            </CenteredCard>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {state.issuers.map((r) => (
                <IssuerRowCard
                  key={r.address}
                  row={r}
                  canEdit={isAuthority}
                  busy={busyRow === r.address}
                  onStatus={(next) => void transitionStatus(r, next)}
                  onEditMeta={() => setEditMetadata(r)}
                  onClose={() => void closeIssuer(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {registerOpen && publicKey ? (
        <RegisterModal
          onClose={() => setRegisterOpen(false)}
          onSubmit={async (form) => {
            try {
              await registerIssuer(form);
              setRegisterOpen(false);
            } catch (err) {
              toast.error(explainSolanaError(err));
            }
          }}
        />
      ) : null}

      {editMetadata ? (
        <EditMetaModal
          row={editMetadata}
          onClose={() => setEditMetadata(null)}
          onSubmit={async (jurisdictions, bitmap, kycRef) => {
            await submitMetadataUpdate(editMetadata, jurisdictions, bitmap, kycRef);
            setEditMetadata(null);
          }}
        />
      ) : null}
    </>
  );
}

function IssuerRowCard({
  row,
  canEdit,
  busy,
  onStatus,
  onEditMeta,
  onClose,
}: {
  row: IssuerRow;
  canEdit: boolean;
  busy: boolean;
  onStatus: (next: IssuerStatusKey) => void;
  onEditMeta: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1rem 1.3rem",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "1rem",
        alignItems: "center",
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, fontFamily: "'SF Mono', Menlo, monospace" }}>
            {shorten(row.owner)}
          </span>
          <StatusPill status={row.status} />
        </div>
        <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
          {row.jurisdictions.join(", ") || "—"} · {assetClassLabels(row.assetClasses).join(" · ") || "no classes"} · KYC {row.kycRef || "—"}
        </div>
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {row.status === "pending" ? (
            <button style={btnSecondary} onClick={() => onStatus("active")} disabled={busy}>
              Activate
            </button>
          ) : null}
          {row.status === "active" ? (
            <button style={btnSecondary} onClick={() => onStatus("suspended")} disabled={busy}>
              Suspend
            </button>
          ) : null}
          {row.status === "suspended" ? (
            <button style={btnSecondary} onClick={() => onStatus("active")} disabled={busy}>
              Reactivate
            </button>
          ) : null}
          {row.status !== "revoked" ? (
            <button style={btnSecondary} onClick={() => onStatus("revoked")} disabled={busy}>
              Revoke
            </button>
          ) : (
            <button style={btnSecondary} onClick={onClose} disabled={busy}>
              Close
            </button>
          )}
          <button style={btnSecondary} onClick={onEditMeta} disabled={busy}>
            Edit metadata
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RegisterModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: {
    ownerPubkey: string;
    jurisdictions: string[];
    assetClassBitmap: number;
    kycRef: string;
    initialStatus: IssuerStatusKey;
  }) => Promise<void>;
}) {
  const [ownerPubkey, setOwner] = useState("");
  const [jurisdictionsRaw, setJurisdictionsRaw] = useState("SRB");
  const [classFlags, setClassFlags] = useState<number>(ASSET_CLASS_FLAGS.commodity);
  const [kycRef, setKycRef] = useState("");
  const [initialStatus, setInitialStatus] = useState<IssuerStatusKey>("active");
  const [submitting, setSubmitting] = useState(false);

  let validOwner: PublicKey | null = null;
  try {
    validOwner = ownerPubkey.trim().length >= 32 ? new PublicKey(ownerPubkey.trim()) : null;
  } catch {
    validOwner = null;
  }
  const jurisdictions = jurisdictionsRaw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);
  const canSubmit =
    !submitting &&
    validOwner !== null &&
    jurisdictions.length > 0 &&
    classFlags > 0 &&
    kycRef.trim().length > 0;

  return (
    <ModalShell onClose={onClose}>
      <h3 style={modalTitle}>Register issuer</h3>
      <p style={modalBlurb}>
        Registers a wallet as a licenced RWA issuer. Only Active issuers authorised for an asset class can mint that class in rwa_mint.
      </p>

      <Label>Owner wallet</Label>
      <input style={input} value={ownerPubkey} onChange={(e) => setOwner(e.target.value.trim())} placeholder="Paste base58 pubkey" />
      {ownerPubkey && !validOwner ? (
        <div style={{ fontSize: "0.76rem", color: "#b91c1c", marginTop: "0.3rem" }}>Invalid address</div>
      ) : null}

      <div style={{ marginTop: "1rem" }}>
        <Label>Jurisdiction codes (3-letter ISO, comma-separated, max 8)</Label>
        <input style={input} value={jurisdictionsRaw} onChange={(e) => setJurisdictionsRaw(e.target.value)} placeholder="SRB, MNE, USA" />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Label>Authorised asset classes</Label>
        <AssetClassPicker value={classFlags} onChange={setClassFlags} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.9rem", marginTop: "1rem" }}>
        <div>
          <Label>KYC reference</Label>
          <input style={input} value={kycRef} onChange={(e) => setKycRef(e.target.value)} placeholder="DEMO-KYC-003" maxLength={96} />
        </div>
        <div>
          <Label>Initial status</Label>
          <select style={input} value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as IssuerStatusKey)}>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <ModalActions
        onClose={onClose}
        submitting={submitting}
        canSubmit={canSubmit}
        label="Register"
        onSubmit={async () => {
          if (!canSubmit || !validOwner) return;
          setSubmitting(true);
          try {
            await onSubmit({
              ownerPubkey: validOwner.toBase58(),
              jurisdictions,
              assetClassBitmap: classFlags,
              kycRef,
              initialStatus,
            });
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </ModalShell>
  );
}

function EditMetaModal({
  row,
  onClose,
  onSubmit,
}: {
  row: IssuerRow;
  onClose: () => void;
  onSubmit: (jurisdictions: string[], bitmap: number, kycRef: string) => Promise<void>;
}) {
  const [jurisdictionsRaw, setJurisdictionsRaw] = useState(row.jurisdictions.join(", "));
  const [classFlags, setClassFlags] = useState(row.assetClasses);
  const [kycRef, setKycRef] = useState(row.kycRef);
  const [submitting, setSubmitting] = useState(false);

  const jurisdictions = jurisdictionsRaw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);
  const canSubmit = !submitting && jurisdictions.length > 0 && classFlags > 0;

  return (
    <ModalShell onClose={onClose}>
      <h3 style={modalTitle}>Edit issuer metadata</h3>
      <p style={modalBlurb}>
        Replace jurisdictions, asset classes, and KYC reference for <code style={code}>{shorten(row.owner)}</code>. Status is unchanged.
      </p>

      <Label>Jurisdictions (comma-separated)</Label>
      <input style={input} value={jurisdictionsRaw} onChange={(e) => setJurisdictionsRaw(e.target.value)} />

      <div style={{ marginTop: "1rem" }}>
        <Label>Authorised asset classes</Label>
        <AssetClassPicker value={classFlags} onChange={setClassFlags} />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Label>KYC reference</Label>
        <input style={input} value={kycRef} onChange={(e) => setKycRef(e.target.value)} maxLength={96} />
      </div>

      <ModalActions
        onClose={onClose}
        submitting={submitting}
        canSubmit={canSubmit}
        label="Update metadata"
        onSubmit={async () => {
          if (!canSubmit) return;
          setSubmitting(true);
          try {
            await onSubmit(jurisdictions, classFlags, kycRef);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </ModalShell>
  );
}

function AssetClassPicker({ value, onChange }: { value: number; onChange: (bitmap: number) => void }) {
  const entries: Array<{ flag: number; label: string }> = [
    { flag: ASSET_CLASS_FLAGS.commodity, label: "Commodity" },
    { flag: ASSET_CLASS_FLAGS.realEstate, label: "Real Estate" },
    { flag: ASSET_CLASS_FLAGS.debt, label: "Debt" },
    { flag: ASSET_CLASS_FLAGS.equity, label: "Equity" },
    { flag: ASSET_CLASS_FLAGS.ticket, label: "Ticket" },
    { flag: ASSET_CLASS_FLAGS.carbon, label: "Carbon" },
    { flag: ASSET_CLASS_FLAGS.other, label: "Other" },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
      {entries.map(({ flag, label }) => {
        const enabled = (value & flag) !== 0;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(enabled ? value & ~flag : value | flag)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: "1px solid",
              borderColor: enabled ? "#4f46e5" : "#e5e7eb",
              background: enabled ? "#eef2ff" : "#ffffff",
              color: enabled ? "#4338ca" : "#6b7280",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: IssuerStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    pending: { bg: "rgba(234,179,8,0.12)", fg: "#854d0e", dot: "#eab308", label: "Pending" },
    suspended: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Suspended" },
    revoked: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Revoked" },
  };
  const c = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: c.bg,
        color: c.fg,
        padding: "0.18rem 0.5rem",
        borderRadius: 4,
        fontSize: "0.72rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
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
          background: "#ffffff",
          borderRadius: 14,
          padding: "1.5rem 1.75rem",
          width: 480,
          maxWidth: "92vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
          maxHeight: "92vh",
          overflowY: "auto",
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
}: {
  onClose: () => void;
  submitting: boolean;
  canSubmit: boolean;
  label: string;
  onSubmit: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
      <button style={btnSecondary} onClick={onClose} disabled={submitting}>
        Cancel
      </button>
      <button
        style={{
          ...btnPrimary,
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

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.3rem" }}>
      {children}
    </label>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const input: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#111827",
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

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.45rem 0.9rem",
  borderRadius: 6,
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};

const code: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#4338ca",
  padding: "0.08rem 0.35rem",
  borderRadius: 4,
  fontSize: "0.78rem",
  fontFamily: "'SF Mono', Menlo, monospace",
};

const modalTitle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
};

const modalBlurb: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#6b7280",
  marginBottom: "1.1rem",
};
