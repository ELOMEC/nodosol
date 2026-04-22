"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { getAppUrl, getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  fetchPlansByCreator,
  periodLabel,
  PlanDoc,
  PlanStatusKey,
  planPda,
  planVaultPda,
  subscriptionProgram,
} from "@/lib/subscription";
import { simulateAndSend } from "@/lib/tx";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; plans: PlanDoc[] }
  | { kind: "error"; message: string };

type PresetKey = "hour" | "day" | "week" | "month";
const PERIODS: Array<{ key: PresetKey; label: string; seconds: number }> = [
  { key: "hour", label: "Hourly", seconds: 3_600 },
  { key: "day", label: "Daily", seconds: 86_400 },
  { key: "week", label: "Weekly", seconds: 7 * 86_400 },
  { key: "month", label: "Monthly", seconds: 30 * 86_400 },
];

export function PlansView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [createOpen, setCreateOpen] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const plans = await fetchPlansByCreator(program, publicKey);
      setState({ kind: "ready", plans });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  async function createPlan(form: { price: number; periodSeconds: number }) {
    if (!publicKey) return;
    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = subscriptionProgram(provider);
    const mint = getUsdcMint();
    const planId = BigInt(Math.floor(Date.now() / 1000));
    const [plan] = planPda(publicKey, planId);
    const [vault] = planVaultPda(plan);
    const priceBase = BigInt(Math.round(form.price * USDC_UNIT));

    const ix = await program.methods
      .createPlan(
        new BN(planId.toString()),
        new BN(priceBase.toString()),
        new BN(form.periodSeconds)
      )
      .accounts({
        creator: publicKey,
        mint,
        plan,
        vault,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const sig = await simulateAndSend(connection, wallet, {
      feePayer: publicKey,
      instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ix,
    ],
    });
    await reload();
  }

  async function transitionStatus(plan: PlanDoc, next: PlanStatusKey) {
    if (!publicKey) return;
    setBusyPlan(plan.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const variant = { [next]: {} } as never;
      const ix = await program.methods
        .updatePlanStatus(variant)
        .accounts({
          creator: publicKey,
          plan: new PublicKey(plan.address),
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
      window.alert(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusyPlan(null);
    }
  }

  async function withdraw(plan: PlanDoc) {
    if (!publicKey) return;
    const maxAmount = Number(plan.totalRevenue - plan.totalWithdrawn) / USDC_UNIT;
    const amountStr = window.prompt(`Withdraw how much USDC? Available: $${maxAmount.toFixed(2)}`, maxAmount.toFixed(2));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      window.alert("Invalid amount");
      return;
    }
    const baseUnits = BigInt(Math.round(amount * USDC_UNIT));
    setBusyPlan(plan.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const mint = new PublicKey(plan.mint);
      const destAta = getAssociatedTokenAddressSync(mint, publicKey, false, TOKEN_2022_PROGRAM_ID);

      const ix = await program.methods
        .withdrawPlanRevenue(new BN(baseUnits.toString()))
        .accounts({
          creator: publicKey,
          plan: new PublicKey(plan.address),
          vault: new PublicKey(plan.vault),
          destination: destAta,
          mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      window.alert(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setBusyPlan(null);
    }
  }

  const plans = state.kind === "ready" ? state.plans : [];

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Subscription plans
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Recurring monthly / weekly / daily access. Subscribers pre-approve 12 billing cycles via SPL delegate so you don&apos;t need them to re-sign every period.
          </p>
        </div>
        {connected ? (
          <button
            onClick={() => setCreateOpen(true)}
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
            + Create plan
          </button>
        ) : null}
      </header>

      {!connected ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>Connect wallet</div>
          <WalletMultiButton />
        </CenteredCard>
      ) : state.kind === "loading" ? (
        <CenteredCard>Loading plans…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : plans.length === 0 ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            No subscription plans yet
          </div>
          <p style={{ fontSize: "0.88rem", color: "#6b7280" }}>
            Click <strong>Create plan</strong> above to offer your first recurring tier.
          </p>
        </CenteredCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {plans.map((p) => (
            <PlanCard
              key={p.address}
              plan={p}
              busy={busyPlan === p.address}
              onStatus={(next) => void transitionStatus(p, next)}
              onWithdraw={() => void withdraw(p)}
            />
          ))}
        </div>
      )}

      {createOpen && publicKey ? (
        <CreatePlanModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (form) => {
            try {
              await createPlan(form);
              setCreateOpen(false);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Create failed");
            }
          }}
        />
      ) : null}
    </>
  );
}

function PlanCard({
  plan,
  busy,
  onStatus,
  onWithdraw,
}: {
  plan: PlanDoc;
  busy: boolean;
  onStatus: (next: PlanStatusKey) => void;
  onWithdraw: () => void;
}) {
  const price = Number(plan.pricePerPeriod) / USDC_UNIT;
  const period = periodLabel(plan.periodSeconds);
  const revenue = Number(plan.totalRevenue) / USDC_UNIT;
  const withdrawn = Number(plan.totalWithdrawn) / USDC_UNIT;
  const withdrawable = revenue - withdrawn;
  const blinkUrl = `${getAppUrl()}/api/actions/subscribe/${plan.creator}/${plan.planId}`;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.2rem 1.4rem",
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <div style={{ fontSize: "1.08rem", fontWeight: 600 }}>${price.toFixed(2)} / {period}</div>
            <PlanStatusPill status={plan.status} />
          </div>
          <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
            Plan id {plan.planId} · created {new Date(plan.createdAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.35rem", fontWeight: 600, color: "#4338ca" }}>{plan.subscriberCount}</div>
          <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>subscribers</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "0.9rem" }}>
        <MiniStat label="Lifetime revenue" value={`$${revenue.toFixed(2)}`} />
        <MiniStat label="Withdrawable" value={`$${withdrawable.toFixed(2)}`} />
        <MiniStat label="Withdrawn" value={`$${withdrawn.toFixed(2)}`} />
      </div>

      <div style={{ background: "#f7f8fa", border: "1px solid #eef0f3", borderRadius: 8, padding: "0.55rem 0.8rem", marginBottom: "0.85rem" }}>
        <div style={{ fontSize: "0.7rem", color: "#6b7280", marginBottom: "0.2rem", letterSpacing: 0.6 }}>SUBSCRIBE LINK (Blink)</div>
        <code style={{ fontSize: "0.76rem", color: "#4338ca", fontFamily: "'SF Mono', Menlo, monospace", wordBreak: "break-all" }}>{blinkUrl}</code>
      </div>

      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        {plan.status === "active" ? (
          <button style={btnSecondary} onClick={() => onStatus("paused")} disabled={busy}>
            Pause sales
          </button>
        ) : plan.status === "paused" ? (
          <button style={btnSecondary} onClick={() => onStatus("active")} disabled={busy}>
            Resume sales
          </button>
        ) : null}
        {plan.status !== "closed" ? (
          <button style={btnSecondary} onClick={() => onStatus("closed")} disabled={busy}>
            Close plan
          </button>
        ) : null}
        <button style={btnPrimary} onClick={onWithdraw} disabled={busy || withdrawable <= 0}>
          Withdraw ${withdrawable.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

function CreatePlanModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: { price: number; periodSeconds: number }) => Promise<void>;
}) {
  const [price, setPrice] = useState("");
  const [preset, setPreset] = useState<PresetKey>("month");
  const [submitting, setSubmitting] = useState(false);

  const priceNum = Number(price);
  const periodSeconds = PERIODS.find((p) => p.key === preset)?.seconds ?? 30 * 86_400;
  const canSubmit = !submitting && Number.isFinite(priceNum) && priceNum > 0;

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
          width: 460,
          maxWidth: "92vw",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.35rem" }}>Create subscription plan</h3>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          Creates a Plan PDA + USDC vault. Subscribers pre-approve 12 cycles when they subscribe.
        </p>

        <div style={{ marginBottom: "1rem" }}>
          <Label>Price per period (USDC)</Label>
          <input type="number" min={0} step="0.01" style={input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5.00" />
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <Label>Billing period</Label>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: preset === p.key ? "#4f46e5" : "#e5e7eb",
                  background: preset === p.key ? "#eef2ff" : "#ffffff",
                  color: preset === p.key ? "#4338ca" : "#374151",
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ background: "#f7f8fa", border: "1px solid #eef0f3", borderRadius: 8, padding: "0.7rem 0.9rem", fontSize: "0.82rem", marginBottom: "1.25rem" }}>
          <SummaryRow k="Price" v={priceNum > 0 ? `$${priceNum.toFixed(2)}` : "—"} />
          <SummaryRow k="Period" v={periodLabel(periodSeconds)} />
          <SummaryRow k="12-cycle commitment" v={priceNum > 0 ? `$${(priceNum * 12).toFixed(2)}` : "—"} bold />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button style={btnSecondary} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? "pointer" : "not-allowed" }}
            disabled={!canSubmit}
            onClick={async () => {
              if (!canSubmit) return;
              setSubmitting(true);
              try {
                await onSubmit({ price: priceNum, periodSeconds });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Creating…" : "Create plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.2rem 0",
        fontWeight: bold ? 600 : 400,
        color: bold ? "#111827" : "#4b5563",
      }}
    >
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function PlanStatusPill({ status }: { status: PlanStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    paused: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Paused" },
    closed: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Closed" },
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f7f8fa", border: "1px solid #eef0f3", borderRadius: 8, padding: "0.55rem 0.75rem" }}>
      <div style={{ fontSize: "0.7rem", color: "#6b7280", marginBottom: "0.15rem" }}>{label}</div>
      <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>{value}</div>
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
  padding: "0.55rem 1.15rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.55rem 1rem",
  borderRadius: 8,
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};
