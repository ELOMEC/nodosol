"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
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
  CreatorProfileDoc,
  creatorProfilePda,
  creatorVaultPda,
  fetchCreatorProfile,
  tipJarProgram,
} from "@/lib/tipJar";
import { simulateAndSend } from "@/lib/tx";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; profile: CreatorProfileDoc | null; vaultBalance: number }
  | { kind: "error"; message: string };

export function TipsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = tipJarProgram(provider);
      const profile = await fetchCreatorProfile(program, publicKey);
      let vaultBalance = 0;
      if (profile) {
        try {
          const info = await connection.getTokenAccountBalance(profile.vault, "confirmed");
          vaultBalance = Number(info.value.uiAmountString ?? 0);
        } catch {
          vaultBalance = 0;
        }
      }
      setState({ kind: "ready", profile, vaultBalance });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: err instanceof Error ? err.message : "Fetch failed" });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setState({ kind: "idle" });
  }, [connected, publicKey, reload]);

  async function initializeCreator() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = tipJarProgram(provider);
      const mint = getUsdcMint();
      const [profile] = creatorProfilePda(publicKey);
      const [vault] = creatorVaultPda(profile);

      const ix = await program.methods
        .initializeCreator()
        .accounts({
          owner: publicKey,
          mint,
          creatorProfile: profile,
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
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Initialize failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(maxAmount: number) {
    if (!publicKey || !state || state.kind !== "ready" || !state.profile) return;
    const amountStr = window.prompt(`Withdraw how much USDC? (max $${maxAmount.toFixed(2)})`, maxAmount.toFixed(2));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      window.alert("Invalid amount");
      return;
    }
    setBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = tipJarProgram(provider);
      const mint = getUsdcMint();
      const destAta = getAssociatedTokenAddressSync(mint, publicKey, false, TOKEN_2022_PROGRAM_ID);
      const baseUnits = BigInt(Math.round(amount * USDC_UNIT));

      const ix = await program.methods
        .withdraw(new BN(baseUnits.toString()))
        .accounts({
          owner: publicKey,
          creatorProfile: state.profile.address,
          vault: state.profile.vault,
          destination: destAta,
          mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();

      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ix,
      ],
      });
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Tip jar
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Receive direct fan-to-creator tips in USDC. Tips settle instantly into your CreatorProfile vault — withdraw any time.
        </p>
      </header>

      {!connected ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>Connect wallet</div>
          <WalletMultiButton />
        </CenteredCard>
      ) : state.kind === "loading" ? (
        <CenteredCard>Loading tip jar…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : state.kind === "ready" && !state.profile ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
            Tip jar not initialised
          </div>
          <p style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1.2rem", maxWidth: 420, margin: "0 auto 1.2rem" }}>
            One-time setup creates a CreatorProfile PDA + USDC vault owned by you. Tipping starts immediately after.
          </p>
          <button
            onClick={() => void initializeCreator()}
            disabled={busy}
            style={{
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              padding: "0.65rem 1.4rem",
              borderRadius: 8,
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Initialising…" : "Initialize tip jar"}
          </button>
        </CenteredCard>
      ) : state.kind === "ready" && state.profile ? (
        <ReadyView profile={state.profile} vaultBalance={state.vaultBalance} busy={busy} onWithdraw={() => void withdraw(state.vaultBalance)} />
      ) : null}
    </>
  );
}

function ReadyView({
  profile,
  vaultBalance,
  busy,
  onWithdraw,
}: {
  profile: CreatorProfileDoc;
  vaultBalance: number;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const total = Number(profile.totalTipsAmount) / USDC_UNIT;
  const withdrawn = Number(profile.totalWithdrawnAmount) / USDC_UNIT;
  const blinkUrl = `${getAppUrl()}/api/actions/tip/${profile.owner.toBase58()}`;
  const nativeUrl = `${getAppUrl()}/b/tip/${profile.owner.toBase58()}`;
  return (
    <>
      <div className="nds-grid-4" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total received" value={`$${total.toFixed(2)}`} sub={`${profile.totalTipCount} tips`} />
        <StatCard label="Vault balance" value={`$${vaultBalance.toFixed(2)}`} sub="Available to withdraw" valueColor="#059669" />
        <StatCard label="Withdrawn" value={`$${withdrawn.toFixed(2)}`} sub="Moved to your ATA" />
        <StatCard label="Average tip" value={profile.totalTipCount > 0 ? `$${(total / profile.totalTipCount).toFixed(2)}` : "—"} sub="Lifetime" />
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          padding: "1.3rem 1.4rem",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>Withdraw funds</h3>
          <p style={{ fontSize: "0.84rem", color: "#6b7280" }}>
            Moves USDC from your tip jar vault to your wallet&apos;s ATA. Instant, on-chain.
          </p>
        </div>
        <button
          onClick={onWithdraw}
          disabled={busy || vaultBalance <= 0}
          style={{
            background: vaultBalance <= 0 ? "#e5e7eb" : "#4f46e5",
            color: vaultBalance <= 0 ? "#9ca3af" : "#fff",
            border: "none",
            padding: "0.65rem 1.35rem",
            borderRadius: 8,
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: vaultBalance <= 0 || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Withdrawing…" : `Withdraw $${vaultBalance.toFixed(2)}`}
        </button>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.3rem 1.4rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>Share your tip link</h3>
        <p style={{ fontSize: "0.84rem", color: "#6b7280", marginBottom: "1rem" }}>
          Share these URLs on Twitter / X, Discord, or a Solana wallet-aware page. First link is a Solana Action (Blink); second opens natively on nodosol.com.
        </p>
        <CopyRow label="Solana Action URL (Blinks-aware clients)" url={blinkUrl} />
        <CopyRow label="Native page on nodosol.com" url={nativeUrl} />
      </div>
    </>
  );
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", marginBottom: "0.25rem", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <code
          style={{
            flex: 1,
            background: "#f7f8fa",
            border: "1px solid #eef0f3",
            borderRadius: 8,
            padding: "0.5rem 0.8rem",
            fontSize: "0.8rem",
            fontFamily: "'SF Mono', Menlo, monospace",
            color: "#4338ca",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              // ignore
            }
          }}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            color: "#374151",
            padding: "0.5rem 0.95rem",
            borderRadius: 8,
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: valueColor ?? "#111827" }}>{value}</div>
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
