"use client";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { fetchPlansByCreator, PlanDoc, subscriptionProgram } from "@/lib/subscription";
import { CreatorProfileDoc, fetchCreatorProfile, tipJarProgram } from "@/lib/tipJar";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; profile: CreatorProfileDoc | null; plans: PlanDoc[] }
  | { kind: "error"; message: string };

export function CreatorOverview() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const tip = tipJarProgram(provider);
      const sub = subscriptionProgram(provider);
      const [profile, plans] = await Promise.all([
        fetchCreatorProfile(tip, publicKey).catch(() => null),
        fetchPlansByCreator(sub, publicKey).catch(() => []),
      ]);
      setState({ kind: "ready", profile, plans });
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

  return (
    <>
      <header style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Creator dashboard
          </h1>
          <p style={{ color: "var(--shell-muted)", fontSize: "0.9rem" }}>
            Manage your tip jar, subscription plans, and event tickets. All funds settle directly to your wallet — Nodosol never holds balances.
          </p>
        </div>
        <Link
          href="/creator/profile"
          style={{
            padding: "0.55rem 1.05rem",
            borderRadius: 8,
            border: "1px solid var(--shell-border-strong)",
            color: "var(--shell-fg)",
            fontSize: "0.85rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Public profile →
        </Link>
      </header>

      {!connected ? (
        <CenteredCard>
          <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            Connect wallet
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", marginBottom: "1rem" }}>
            Connect a Solana wallet to see your creator state.
          </div>
          <WalletMultiButton />
        </CenteredCard>
      ) : state.kind === "loading" ? (
        <CenteredCard>Loading creator state…</CenteredCard>
      ) : state.kind === "error" ? (
        <CenteredCard>Failed: {state.message}</CenteredCard>
      ) : state.kind === "ready" ? (
        <ReadyView profile={state.profile} plans={state.plans} />
      ) : null}
    </>
  );
}

function ReadyView({ profile, plans }: { profile: CreatorProfileDoc | null; plans: PlanDoc[] }) {
  const totalTips = profile ? Number(profile.totalTipsAmount) / USDC_UNIT : 0;
  const tipCount = profile?.totalTipCount ?? 0;
  const withdrawnTips = profile ? Number(profile.totalWithdrawnAmount) / USDC_UNIT : 0;
  const withdrawableTips = totalTips - withdrawnTips;

  const activePlans = plans.filter((p) => p.status === "active").length;
  const totalSubscribers = plans.reduce((s, p) => s + p.subscriberCount, 0);
  const planRevenue = plans.reduce(
    (s, p) => s + Number(p.totalRevenue) / USDC_UNIT,
    0
  );
  const planWithdrawn = plans.reduce(
    (s, p) => s + Number(p.totalWithdrawn) / USDC_UNIT,
    0
  );
  const planWithdrawable = planRevenue - planWithdrawn;

  return (
    <>
      <div className="nds-grid-4" style={{ gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Tip jar" value={profile ? "Active" : "Not set up"} sub={profile ? `$${totalTips.toFixed(2)} from ${tipCount} tips` : "Initialize to start receiving"} valueColor={profile ? "#059669" : "var(--shell-faint)"} />
        <StatCard label="Subscription plans" value={plans.length.toString()} sub={`${activePlans} active · ${totalSubscribers} total subscribers`} />
        <StatCard label="Withdrawable now" value={`$${(withdrawableTips + planWithdrawable).toFixed(2)}`} sub="Tips + plans combined" />
        <StatCard label="Lifetime revenue" value={`$${(totalTips + planRevenue).toFixed(2)}`} sub="Across all creator rails" />
      </div>

      <div className="nds-grid-2" style={{ gap: "1rem" }}>
        <SectionCard
          title="Tip jar"
          subtitle={profile ? "Active and accepting tips" : "Not initialized yet"}
          href="/creator/tips"
          cta={profile ? "Manage tips" : "Initialize tip jar"}
        >
          {profile ? (
            <>
              <KV k="Total received" v={`$${totalTips.toFixed(2)}`} />
              <KV k="Tip count" v={tipCount.toString()} />
              <KV k="Withdrawable" v={`$${withdrawableTips.toFixed(2)}`} />
            </>
          ) : (
            <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", padding: "0.5rem 0" }}>
              One-time setup creates your CreatorProfile PDA + USDC vault. Tips arrive instantly, you withdraw any time.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Subscriptions"
          subtitle={plans.length > 0 ? `${plans.length} plan${plans.length === 1 ? "" : "s"}` : "No plans yet"}
          href="/creator/plans"
          cta={plans.length > 0 ? "Manage plans" : "Create first plan"}
        >
          {plans.length > 0 ? (
            <>
              <KV k="Active plans" v={activePlans.toString()} />
              <KV k="Total subscribers" v={totalSubscribers.toString()} />
              <KV k="Withdrawable" v={`$${planWithdrawable.toFixed(2)}`} />
            </>
          ) : (
            <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", padding: "0.5rem 0" }}>
              Offer recurring monthly / weekly access. SPL token delegate pattern pre-approves N billing cycles so subscribers don&apos;t re-sign each period.
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <SectionCard
          title="Events"
          subtitle="Multi-tier cNFT tickets with venue map pricing + fee split"
          href="/creator/events"
          cta="Manage events"
        >
          <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)", padding: "0.5rem 0" }}>
            Sell event tickets as cNFTs. Each ticket is a Bubblegum leaf — transferable, viewable in Phantom Collectibles, Tensor / Magic Eden compatible.
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ background: "var(--shell-card)", border: "1px solid var(--shell-border)", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: valueColor ?? "var(--shell-fg)" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "var(--shell-faint)", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  href,
  cta,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "1.3rem 1.4rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.2rem" }}>{title}</h3>
          <p style={{ fontSize: "0.82rem", color: "var(--shell-muted)" }}>{subtitle}</p>
        </div>
        <Link
          href={href}
          style={{
            background: "#4f46e5",
            color: "#fff",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            fontSize: "0.82rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {cta} →
        </Link>
      </div>
      <div>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--shell-divider)", fontSize: "0.88rem" }}>
      <span style={{ color: "var(--shell-muted)" }}>{k}</span>
      <span style={{ color: "var(--shell-fg)", fontWeight: 500 }}>{v}</span>
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
