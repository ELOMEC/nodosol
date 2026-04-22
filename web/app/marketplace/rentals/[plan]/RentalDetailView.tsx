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
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LocationView } from "@/components/LocationView";
import { USDC_UNIT, getUsdcMint } from "@/lib/constants";
import { fetchRentalMetadata, RentalMetadata } from "@/lib/rentalMetadata";
import {
  planVaultPda,
  subscriptionConfigPda,
  subscriptionPda,
  subscriptionProgram,
} from "@/lib/subscription";
import { simulateAndSend } from "@/lib/tx";

type PlanData = {
  address: string;
  creator: string;
  mint: string;
  vault: string;
  pricePerPeriodBase: bigint;
  periodSeconds: number;
  active: boolean;
  subscriberCount: number;
  totalCollected: bigint;
  totalWithdrawn: bigint;
};

type MySubscription = {
  active: boolean;
  startedAt: number;
  lastChargedAt: number;
  nextChargeAt: number;
  chargeCount: number;
  totalPaid: bigint;
};

type Loaded = {
  plan: PlanData;
  metadata: RentalMetadata | null;
  mySubscription: MySubscription | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; loaded: Loaded }
  | { kind: "error"; message: string };

export function RentalDetailView({ planAddress }: { planAddress: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [cycles, setCycles] = useState("12");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const planPk = new PublicKey(planAddress);

      const planApi = (program.account as Record<string, {
        fetchNullable: (addr: PublicKey) => Promise<{
          creator: PublicKey;
          mint: PublicKey;
          vault: PublicKey;
          pricePerPeriod: BN;
          periodSeconds: BN;
          active: boolean;
          subscriberCount: BN;
          totalCollected: BN;
          totalWithdrawn: BN;
        } | null>;
      }>).subscriptionPlan;
      const raw = await planApi.fetchNullable(planPk);
      if (!raw) {
        setState({ kind: "error", message: "Plan not found." });
        return;
      }
      const plan: PlanData = {
        address: planAddress,
        creator: raw.creator.toBase58(),
        mint: raw.mint.toBase58(),
        vault: raw.vault.toBase58(),
        pricePerPeriodBase: BigInt(raw.pricePerPeriod.toString()),
        periodSeconds: raw.periodSeconds.toNumber(),
        active: raw.active,
        subscriberCount: raw.subscriberCount.toNumber(),
        totalCollected: BigInt(raw.totalCollected.toString()),
        totalWithdrawn: BigInt(raw.totalWithdrawn.toString()),
      };

      const metadata = await fetchRentalMetadata(planAddress);

      let mySubscription: MySubscription | null = null;
      if (publicKey) {
        const [subPda] = subscriptionPda(planPk, publicKey);
        const subApi = (program.account as Record<string, {
          fetchNullable: (addr: PublicKey) => Promise<{
            startedAt: BN;
            lastChargedAt: BN;
            nextChargeAt: BN;
            chargeCount: BN;
            totalPaid: BN;
            status: Record<string, unknown>;
          } | null>;
        }>).subscription;
        const subRaw = await subApi.fetchNullable(subPda);
        if (subRaw) {
          mySubscription = {
            active: "active" in subRaw.status,
            startedAt: subRaw.startedAt.toNumber(),
            lastChargedAt: subRaw.lastChargedAt.toNumber(),
            nextChargeAt: subRaw.nextChargeAt.toNumber(),
            chargeCount: subRaw.chargeCount.toNumber(),
            totalPaid: BigInt(subRaw.totalPaid.toString()),
          };
        }
      }

      setState({ kind: "ready", loaded: { plan, metadata, mySubscription } });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: err instanceof Error ? err.message : "Load failed" });
    }
  }, [planAddress, connection, wallet, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function subscribe() {
    if (!publicKey || state.kind !== "ready") return;
    const n = parseInt(cycles, 10);
    if (!Number.isInteger(n) || n < 1) {
      window.alert("Cycles must be an integer ≥ 1.");
      return;
    }
    setBusy(true);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const planPk = new PublicKey(planAddress);
      const plan = state.loaded.plan;
      const mint = getUsdcMint();
      const [subPda] = subscriptionPda(planPk, publicKey);
      const [configPda] = subscriptionConfigPda();

      // Fetch config to get treasury
      const cfgApi = (program.account as Record<string, {
        fetch: (addr: PublicKey) => Promise<{ treasury: PublicKey }>;
      }>).config;
      const cfg = await cfgApi.fetch(configPda);

      const subscriberAta = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const approveAmount = plan.pricePerPeriodBase * BigInt(n);

      const ix = await program.methods
        .subscribe(new BN(approveAmount.toString()))
        .accounts({
          subscriber: publicKey,
          subscriberTokenAccount: subscriberAta,
          plan: planPk,
          vault: new PublicKey(plan.vault),
          subscription: subPda,
          config: configPda,
          treasury: cfg.treasury,
          mint,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: PublicKey.default,
        } as never)
        .instruction();

      const sig = await simulateAndSend(connection, wallet, {
        feePayer: publicKey,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ix,
        ],
      });
      window.alert(`Subscribed. First month charged now. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <Centered>
        <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
        <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
          Subscribe or manage rentals requires a connected wallet.
        </div>
        <WalletMultiButton />
      </Centered>
    );
  }

  if (state.kind === "loading") {
    return <Centered>Loading…</Centered>;
  }
  if (state.kind === "error") {
    return <Centered>{state.message}</Centered>;
  }

  const { plan, metadata, mySubscription } = state.loaded;
  const priceUsdc = Number(plan.pricePerPeriodBase) / USDC_UNIT;
  const periodDays = Math.round(plan.periodSeconds / 86400);
  const me = publicKey?.toBase58();
  const isLandlord = me === plan.creator;
  const withdrawableBase = plan.totalCollected - plan.totalWithdrawn;
  const withdrawableUsdc = Number(withdrawableBase) / USDC_UNIT;

  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <Link href="/marketplace/rentals" style={{ fontSize: "0.85rem", color: "#6b7280", textDecoration: "none" }}>
          ← All rentals
        </Link>
        <h1 style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", marginTop: "0.35rem", marginBottom: "0.3rem" }}>
          {metadata?.title ?? "Untitled rental"}
        </h1>
        <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          Landlord {plan.creator.slice(0, 6)}…{plan.creator.slice(-4)}
          {!plan.active && <> · <span style={{ color: "#b91c1c", fontWeight: 600 }}>Paused</span></>}
        </div>
      </header>

      {metadata?.gallery && metadata.gallery.length > 0 && (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
            {metadata.gallery.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Rent terms</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.88rem" }}>
          <KV k="Monthly rent" v={`$${priceUsdc.toFixed(2)} USDC`} />
          <KV k="Period length" v={`${periodDays} day${periodDays === 1 ? "" : "s"}`} />
          <KV k="Active tenants" v={plan.subscriberCount.toString()} />
          <KV k="Active" v={plan.active ? "Yes" : "Paused"} />
        </div>
      </Card>

      {metadata?.description && (
        <Card>
          <SectionTitle>About this place</SectionTitle>
          <div style={{ fontSize: "0.88rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {metadata.description}
          </div>
        </Card>
      )}

      {metadata?.amenities && metadata.amenities.length > 0 && (
        <Card>
          <SectionTitle>Amenities</SectionTitle>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {metadata.amenities.map((a) => (
              <span
                key={a}
                style={{
                  fontSize: "0.76rem",
                  background: "var(--shell-pill-bg, #f7f8fa)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: 999,
                  color: "var(--shell-fg, #111827)",
                }}
              >
                {a}
              </span>
            ))}
          </div>
        </Card>
      )}

      {metadata?.location && (
        <Card>
          <SectionTitle>Location</SectionTitle>
          <LocationView location={metadata.location} />
        </Card>
      )}

      {metadata?.videoUrl && (
        <Card>
          <SectionTitle>Video</SectionTitle>
          <a
            href={metadata.videoUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.85rem", color: "#4338ca", textDecoration: "none", wordBreak: "break-all" }}
          >
            Watch walkthrough ↗
          </a>
        </Card>
      )}

      {metadata?.terms && (
        <Card>
          <SectionTitle>Terms &amp; house rules</SectionTitle>
          <div style={{ fontSize: "0.85rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {metadata.terms}
          </div>
        </Card>
      )}

      {!isLandlord && !mySubscription && plan.active && (
        <Card>
          <SectionTitle>Subscribe to rent</SectionTitle>
          <div style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "0.65rem" }}>
            Pre-approve <strong>{cycles || 12}</strong> monthly charges (total
            ${(priceUsdc * (parseInt(cycles, 10) || 12)).toFixed(2)} USDC). First
            rent is paid now; subsequent rent pulls automatically each{" "}
            {periodDays} days via the delegate pattern.
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.78rem", color: "#6b7280" }}>
              Months to pre-approve
            </label>
            <input
              type="number"
              min={1}
              max={36}
              value={cycles}
              onChange={(e) => setCycles(e.target.value)}
              style={{ ...inputStyle, width: 90 }}
            />
            <button
              type="button"
              onClick={() => void subscribe()}
              disabled={busy}
              style={primaryBtn(busy)}
            >
              {busy ? "Subscribing…" : "Subscribe + pay first rent"}
            </button>
          </div>
        </Card>
      )}

      {mySubscription && (
        <Card>
          <SectionTitle>Your subscription</SectionTitle>
          <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem" }}>
            <KV k="Status" v={mySubscription.active ? "Active" : "Inactive"} />
            <KV k="Started" v={new Date(mySubscription.startedAt * 1000).toLocaleString()} />
            <KV k="Last charged" v={new Date(mySubscription.lastChargedAt * 1000).toLocaleString()} />
            <KV k="Next charge" v={new Date(mySubscription.nextChargeAt * 1000).toLocaleString()} />
            <KV k="Charges so far" v={mySubscription.chargeCount.toString()} />
            <KV k="Total paid" v={`$${(Number(mySubscription.totalPaid) / USDC_UNIT).toFixed(2)}`} />
          </div>
        </Card>
      )}

      {isLandlord && (
        <Card>
          <SectionTitle>Landlord panel</SectionTitle>
          <div style={{ fontSize: "0.88rem", marginBottom: "0.45rem" }}>
            Collected so far: <strong>${(Number(plan.totalCollected) / USDC_UNIT).toFixed(2)}</strong>
            {" · "}Withdrawable: <strong>${withdrawableUsdc.toFixed(2)}</strong>
          </div>
          <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
            Use <Link href="/creator/plans" style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 600 }}>/creator/plans</Link> to withdraw, pause / reactivate, or close this plan.
          </div>
        </Card>
      )}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.15rem",
        marginBottom: "0.85rem",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.55rem" }}>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "0.45rem" }}>
      <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#6b7280", background: "var(--shell-card, #fff)", border: "1px solid var(--shell-border, #eef0f3)", borderRadius: 12 }}>
      {children}
    </div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.55rem 1.1rem",
    borderRadius: 7,
    border: "none",
    background: disabled ? "#c7d2fe" : "#4f46e5",
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: 7,
  border: "1px solid var(--shell-border, #eef0f3)",
  background: "var(--shell-card, #fff)",
  color: "var(--shell-fg, #111827)",
  fontSize: "0.88rem",
};
