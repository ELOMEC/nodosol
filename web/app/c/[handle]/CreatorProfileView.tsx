"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import type { CreatorProfileRow } from "@/lib/creatorProfile";
import { fetchCreatorProfile, tipJarProgram } from "@/lib/tipJar";
import { subscriptionProgram } from "@/lib/subscription";

type OnChainTipStats = {
  totalTipsAmount: number;
  totalTipCount: number;
  totalWithdrawn: number;
} | null;

type Plan = {
  address: string;
  priceUsdc: number;
  periodSeconds: number;
  active: boolean;
  subscriberCount: number;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; tips: OnChainTipStats; plans: Plan[] }
  | { kind: "error"; message: string };

export function CreatorProfileView({ profile }: { profile: CreatorProfileRow }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const tipProg = tipJarProgram(provider);
      const subProg = subscriptionProgram(provider);
      const owner = new PublicKey(profile.wallet_pubkey);

      const tipsDoc = await fetchCreatorProfile(tipProg, owner);
      const tips: OnChainTipStats = tipsDoc
        ? {
            totalTipsAmount: Number(tipsDoc.totalTipsAmount.toString()) / USDC_UNIT,
            totalTipCount: Number(tipsDoc.totalTipCount.toString()),
            totalWithdrawn: Number(tipsDoc.totalWithdrawnAmount.toString()) / USDC_UNIT,
          }
        : null;

      const planApi = (subProg.account as Record<string, {
        all: (filters?: unknown) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            creator: PublicKey;
            pricePerPeriod: BN;
            periodSeconds: BN;
            active: boolean;
            subscriberCount: BN;
          };
        }>>;
      }>).subscriptionPlan;
      const allPlans = await planApi.all();
      const plans = allPlans
        .filter((p) => p.account.creator.toBase58() === profile.wallet_pubkey)
        .map((p) => ({
          address: p.publicKey.toBase58(),
          priceUsdc: Number(p.account.pricePerPeriod.toString()) / USDC_UNIT,
          periodSeconds: p.account.periodSeconds.toNumber(),
          active: p.account.active,
          subscriberCount: p.account.subscriberCount.toNumber(),
        }));

      setState({ kind: "ready", tips, plans });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, wallet, profile.wallet_pubkey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={brandStyle}>
          <span style={logoMark}>n</span>
          <span style={{ fontWeight: 600 }}>nodosol</span>
        </Link>
        <Link href="/welcome" style={{ ...mutedLink, fontSize: "0.85rem" }}>
          Get on Nodosol →
        </Link>
      </header>

      {profile.banner_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.banner_url}
          alt=""
          style={{
            width: "100%",
            height: 200,
            objectFit: "cover",
            borderRadius: 12,
            marginBottom: "-2rem",
          }}
        />
      ) : null}

      <section style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", marginBottom: "2rem", padding: profile.banner_url ? "0 1rem" : 0 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 16,
            background: profile.avatar_url
              ? `center / cover no-repeat url(${profile.avatar_url})`
              : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            border: "3px solid #0a0a0a",
            flexShrink: 0,
            marginTop: profile.banner_url ? "-2rem" : 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            {profile.display_name ?? profile.handle}
          </h1>
          <div style={{ color: "#7b9cff", fontSize: "0.95rem", marginBottom: "0.85rem" }}>
            @{profile.handle}
          </div>
          {profile.bio ? (
            <p style={{ color: "#b5b5b5", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: "1rem", maxWidth: 620 }}>
              {profile.bio}
            </p>
          ) : null}
          <SocialLinks profile={profile} />
        </div>
      </section>

      <section style={ctaRowStyle}>
        <Link
          href={`/b/tip/${profile.wallet_pubkey}`}
          style={primaryCta}
        >
          Tip in USDC
        </Link>
        {state.kind === "ready" && state.plans.length > 0 ? (
          <a href="#subscriptions" style={secondaryCta}>
            Subscribe →
          </a>
        ) : null}
      </section>

      {state.kind === "loading" ? (
        <div style={mutedRow}>Loading on-chain data…</div>
      ) : state.kind === "error" ? (
        <div style={{ ...mutedRow, color: "#fca5a5" }}>Couldn&apos;t load on-chain data: {state.message}</div>
      ) : (
        <>
          {state.tips ? (
            <section style={cardStyle}>
              <h2 style={h2Style}>Tip jar</h2>
              <div style={statsGrid}>
                <Stat label="Tips received" value={`$${state.tips.totalTipsAmount.toFixed(2)}`} />
                <Stat label="Tip count" value={state.tips.totalTipCount.toString()} />
                <Stat label="Withdrawn" value={`$${state.tips.totalWithdrawn.toFixed(2)}`} />
              </div>
            </section>
          ) : (
            <section style={cardStyle}>
              <h2 style={h2Style}>Tip jar</h2>
              <p style={{ color: "#9a9a9a", fontSize: "0.92rem" }}>
                {profile.display_name ?? profile.handle} hasn&apos;t initialised a tip jar yet.
              </p>
            </section>
          )}

          {state.plans.length > 0 ? (
            <section id="subscriptions" style={cardStyle}>
              <h2 style={h2Style}>Subscription plans</h2>
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {state.plans.map((p) => (
                  <PlanRow key={p.address} plan={p} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <footer style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid #1a1a1a", color: "#6b6b6b", fontSize: "0.78rem", display: "flex", justifyContent: "space-between" }}>
        <span>
          Wallet:{" "}
          <code style={{ fontFamily: "'SF Mono', monospace" }}>
            {profile.wallet_pubkey.slice(0, 6)}…{profile.wallet_pubkey.slice(-4)}
          </code>
        </span>
        <Link href="/" style={mutedLink}>
          Powered by nodosol
        </Link>
      </footer>
    </main>
  );
}

function SocialLinks({ profile }: { profile: CreatorProfileRow }) {
  const items: Array<{ label: string; href: string }> = [];
  if (profile.twitter) items.push({ label: "Twitter", href: `https://twitter.com/${profile.twitter.replace(/^@/, "")}` });
  if (profile.website) items.push({ label: "Website", href: profile.website });
  if (profile.discord) items.push({ label: "Discord", href: profile.discord });
  if (profile.telegram) items.push({ label: "Telegram", href: profile.telegram });
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
      {items.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: 6,
            border: "1px solid #2a2a2a",
            color: "#c5cdf5",
            fontSize: "0.82rem",
            textDecoration: "none",
            background: "#0f0f0f",
          }}
        >
          {s.label} ↗
        </a>
      ))}
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const days = Math.round(plan.periodSeconds / 86400);
  return (
    <Link
      href={`/b/subscribe/${plan.address}`}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.85rem 1.05rem",
        background: "#0a0a0a",
        border: "1px solid #1a1a1a",
        borderRadius: 10,
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "0.96rem" }}>
          ${plan.priceUsdc.toFixed(2)} / {days} day{days === 1 ? "" : "s"}
        </div>
        <div style={{ fontSize: "0.78rem", color: "#8a8a8a", marginTop: "0.2rem" }}>
          {plan.subscriberCount} subscriber{plan.subscriberCount === 1 ? "" : "s"}{!plan.active ? " · paused" : ""}
        </div>
      </div>
      <span style={{ color: "#7b9cff", fontSize: "0.85rem", fontWeight: 600 }}>
        Subscribe →
      </span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#8a8a8a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "2.5rem 1.5rem 4rem",
  color: "#e8e8e8",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  color: "#fff",
  textDecoration: "none",
};

const logoMark: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
};

const ctaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  marginBottom: "1.75rem",
  flexWrap: "wrap",
};

const primaryCta: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  padding: "0.7rem 1.3rem",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: "0.92rem",
  textDecoration: "none",
};

const secondaryCta: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #2a2a2a",
  color: "#e8e8e8",
  padding: "0.7rem 1.3rem",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.92rem",
  textDecoration: "none",
};

const cardStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 12,
  padding: "1.5rem 1.6rem",
  marginBottom: "1.25rem",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "1rem",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "1rem",
};

const mutedRow: React.CSSProperties = {
  color: "#9a9a9a",
  fontSize: "0.9rem",
  padding: "1.5rem 0",
};

const mutedLink: React.CSSProperties = {
  color: "#8a8a8a",
  textDecoration: "none",
};
