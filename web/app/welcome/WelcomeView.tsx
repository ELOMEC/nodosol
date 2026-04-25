"use client";

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getUsdcMint } from "@/lib/constants";
import {
  creatorProfilePda,
  creatorVaultPda,
  fetchCreatorProfile,
  tipJarProgram,
} from "@/lib/tipJar";
import { simulateAndSend } from "@/lib/tx";
import { explainSolanaError } from "@/lib/solanaErrors";
import { useToast } from "@/components/ToastProvider";

const FLAG_KEY = "nodosol-onboarded-v1";

type Role = "creator" | "issuer" | "buyer" | "investor";
type Step = 1 | 2 | 3 | 4;

export function WelcomeView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [hasCreatorProfile, setHasCreatorProfile] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Auto-advance to step 2 once wallet connects on step 1.
  useEffect(() => {
    if (step === 1 && connected) setStep(2);
  }, [connected, step]);

  // When we land on step 4 as a creator, check if profile already exists.
  useEffect(() => {
    if (step === 4 && role === "creator" && publicKey) {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = tipJarProgram(provider);
      void fetchCreatorProfile(program, publicKey)
        .then((p) => setHasCreatorProfile(p !== null))
        .catch(() => setHasCreatorProfile(null));
    }
  }, [step, role, publicKey, connection, wallet]);

  function finish() {
    try {
      window.localStorage.setItem(FLAG_KEY, "1");
    } catch {
      // ignore
    }
    router.push(roleDestination(role));
  }

  async function initializeCreatorProfile() {
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
      setHasCreatorProfile(true);
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <header style={topNavStyle}>
        <Link href="/" style={brandStyle}>
          <span style={logoMark}>n</span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>nodosol</span>
        </Link>
        <button onClick={finish} style={skipStyle}>
          Skip onboarding →
        </button>
      </header>

      <Stepper step={step} />

      <section style={cardStyle}>
        {step === 1 ? (
          <Step1 connected={connected} />
        ) : step === 2 ? (
          <Step2 onPick={(r) => { setRole(r); setStep(3); }} role={role} />
        ) : step === 3 ? (
          <Step3 role={role} onBack={() => setStep(2)} onNext={() => setStep(4)} />
        ) : (
          <Step4
            role={role}
            hasCreatorProfile={hasCreatorProfile}
            busy={busy}
            onInitProfile={() => void initializeCreatorProfile()}
            onFinish={finish}
          />
        )}
      </section>
    </main>
  );
}

function Step1({ connected }: { connected: boolean }) {
  return (
    <>
      <h1 style={h1Style}>
        Get up and running on Nodosol in <span style={{ color: "#a5b4fc" }}>30 seconds</span>.
      </h1>
      <p style={leadStyle}>
        Nodosol is a Solana super-app: licenced RWA marketplace, creator
        payments, OTC escrow, and compressed NFT event tickets. Every flow is
        on-chain — there is no backend that holds your funds.
      </p>
      <p style={leadStyle}>
        We&apos;ll connect a Solana wallet (Phantom or Backpack), figure out
        what you want to do, and get you to the right place.
      </p>
      <div style={{ marginTop: "2rem" }}>
        {connected ? (
          <div style={greenPill}>Wallet connected. Continuing…</div>
        ) : (
          <WalletMultiButton />
        )}
      </div>
      <div
        style={{
          marginTop: "2rem",
          padding: "1rem 1.1rem",
          background: "rgba(123,156,255,0.06)",
          border: "1px solid rgba(123,156,255,0.18)",
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: "0.85rem", color: "#c5cdf5", fontWeight: 600, marginBottom: "0.5rem" }}>
          Devnet quickstart
        </div>
        <div style={{ fontSize: "0.82rem", color: "#9ca3af", lineHeight: 1.6 }}>
          1. Switch your wallet to <strong style={{ color: "#e8e8e8" }}>devnet</strong> (Phantom: Settings → Developer Settings → Testnet Mode)
          <br />
          2. <a href="https://faucet.quicknode.com/solana/devnet" target="_blank" rel="noreferrer" style={linkStyle}>Get devnet SOL</a> for tx fees (~0.5 SOL is plenty)
          <br />
          3. Need test USDC for buys/tips? Ask in <a href="mailto:office@nodosol.com" style={linkStyle}>office@nodosol.com</a> or run <code style={codeInline}>npx tsx scripts/fund-user.ts &lt;pubkey&gt;</code> from the repo
        </div>
      </div>
      <p style={{ ...mutedStyle, marginTop: "1.5rem" }}>
        New to Solana wallets?{" "}
        <a href="https://phantom.com/" target="_blank" rel="noreferrer" style={linkStyle}>
          Install Phantom
        </a>{" "}
        ·{" "}
        <a href="https://backpack.app/" target="_blank" rel="noreferrer" style={linkStyle}>
          Install Backpack
        </a>
      </p>
    </>
  );
}

function Step2({ onPick, role }: { onPick: (r: Role) => void; role: Role | null }) {
  return (
    <>
      <h1 style={h1Style}>What brings you here?</h1>
      <p style={leadStyle}>Pick the path that matches you. You can change your mind later.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "2rem" }}>
        <RoleCard
          title="Creator"
          blurb="Receive tips, run subscriptions, sell event tickets in USDC. No payment processor, no take-rate beyond Nodosol's platform fee."
          active={role === "creator"}
          onClick={() => onPick("creator")}
        />
        <RoleCard
          title="Buyer"
          blurb="Browse the RWA marketplace, support creators, buy event tickets that land in your wallet as cNFTs."
          active={role === "buyer"}
          onClick={() => onPick("buyer")}
        />
        <RoleCard
          title="Issuer"
          blurb="Tokenise real-world assets (commodities, debt, real estate). Requires KYC + listing in our on-chain registry."
          active={role === "issuer"}
          onClick={() => onPick("issuer")}
        />
        <RoleCard
          title="Investor"
          blurb="Read the pitch, see live on-chain stats, check the architecture, and reach out."
          active={role === "investor"}
          onClick={() => onPick("investor")}
        />
      </div>
    </>
  );
}

function Step3({ role, onBack, onNext }: { role: Role | null; onBack: () => void; onNext: () => void }) {
  if (role === null) {
    return (
      <>
        <h1 style={h1Style}>Pick a role first</h1>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
      </>
    );
  }
  const map: Record<Role, { title: string; lines: string[] }> = {
    creator: {
      title: "What you can do as a creator",
      lines: [
        "Tip jar — share a Solana Action (Blink) URL anywhere; fans tip in USDC, you withdraw any time.",
        "Subscriptions — recurring monthly/weekly billing pre-approved 12 cycles via SPL delegate.",
        "Events — issue tickets as compressed NFTs (Bubblegum); transferable, secondary-market ready.",
      ],
    },
    buyer: {
      title: "What you can do as a buyer",
      lines: [
        "Browse the marketplace — every listing is on-chain, every price is in USDC, every buy settles in one Solana transaction.",
        "Buy event tickets — compressed NFTs land in your Phantom Collectibles in seconds.",
        "Make OTC offers — bilateral escrow with expiry, chat for negotiation, atomic accept.",
      ],
    },
    issuer: {
      title: "What you can do as an issuer",
      lines: [
        "Tokenise commodities, real estate, debt, equity — Token-2022 mints with fixed supply.",
        "List into the open marketplace or run private OTC deals.",
        "Eligibility: your wallet must be Active in the rwa_registry. Contact office@nodosol.com to apply for issuer status.",
      ],
    },
    investor: {
      title: "What you can do as an investor",
      lines: [
        "Read the pitch — clean one-page version with our market thesis, ask, and use of funds.",
        "Audit live state — every metric is queried from Solana RPC at page load, no caching.",
        "Reach out — office@nodosol.com or warm intros via the Solana Foundation network.",
      ],
    },
  };
  const { title, lines } = map[role];
  return (
    <>
      <h1 style={h1Style}>{title}</h1>
      <ul style={{ marginTop: "1.5rem", paddingLeft: "1.25rem", color: "#b5b5b5", fontSize: "1rem", lineHeight: 1.8 }}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: "0.6rem", marginTop: "2rem" }}>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
        <button onClick={onNext} style={btnPrimary}>Continue →</button>
      </div>
    </>
  );
}

function Step4({
  role,
  hasCreatorProfile,
  busy,
  onInitProfile,
  onFinish,
}: {
  role: Role | null;
  hasCreatorProfile: boolean | null;
  busy: boolean;
  onInitProfile: () => void;
  onFinish: () => void;
}) {
  if (role === "creator") {
    return (
      <>
        <h1 style={h1Style}>One-time setup: tip jar</h1>
        <p style={leadStyle}>
          Initialise your CreatorProfile + USDC vault. After this you can share your tip link anywhere and start receiving USDC.
        </p>
        {hasCreatorProfile === null ? (
          <div style={{ ...mutedStyle, marginTop: "1.5rem" }}>Checking your tip jar status…</div>
        ) : hasCreatorProfile ? (
          <div style={{ ...greenPill, marginTop: "1.5rem" }}>
            Your tip jar is already initialised.
          </div>
        ) : (
          <button onClick={onInitProfile} disabled={busy} style={{ ...btnPrimary, marginTop: "1.5rem" }}>
            {busy ? "Initialising…" : "Initialise tip jar"}
          </button>
        )}
        <div style={{ marginTop: "1.5rem" }}>
          <button onClick={onFinish} style={btnSecondary}>
            {hasCreatorProfile ? "Open creator dashboard →" : "Skip and explore the app →"}
          </button>
        </div>
      </>
    );
  }
  if (role === "buyer") {
    return (
      <FinalStep
        title="You're set up"
        body="Head to the marketplace and explore listings, OTC deals, and events. Your purchases settle directly to your wallet."
        cta="Open the marketplace"
        onFinish={onFinish}
        suggestions={[
          { label: "Browse events", href: "/marketplace/events" },
          { label: "See sealed-bid auctions", href: "/marketplace/auctions" },
          { label: "Check the resale board", href: "/marketplace/resale" },
        ]}
      />
    );
  }
  if (role === "issuer") {
    return (
      <FinalStep
        title="Issuer onboarding is whitelist-based"
        body="Email office@nodosol.com from the wallet you connected and we'll get you registered. Until then, you can preview the tokenization flow on the demo issuer."
        cta="See the tokenize flow"
        onFinish={onFinish}
      />
    );
  }
  if (role === "investor") {
    return (
      <FinalStep
        title="Read the pitch + live stats"
        body="The pitch page is the one-pager you can forward to your partners. Architecture and security details live on /tech. Stats are queried from Solana RPC live, no caching."
        cta="Open the pitch"
        onFinish={onFinish}
        suggestions={[
          { label: "Architecture & security (/tech)", href: "/tech" },
          { label: "Live program stats", href: "/stats" },
        ]}
      />
    );
  }
  return (
    <FinalStep
      title="You're set"
      body="Welcome to Nodosol."
      cta="Open the app"
      onFinish={onFinish}
    />
  );
}

function FinalStep({
  title,
  body,
  cta,
  onFinish,
  suggestions,
}: {
  title: string;
  body: string;
  cta: string;
  onFinish: () => void;
  suggestions?: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <>
      <h1 style={h1Style}>{title}</h1>
      <p style={leadStyle}>{body}</p>
      <div style={{ marginTop: "2rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button onClick={onFinish} style={btnPrimary}>{cta} →</button>
      </div>
      {suggestions && suggestions.length > 0 ? (
        <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px solid #1a1a1a" }}>
          <div style={{ fontSize: "0.78rem", color: "#8a8a8a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.7rem" }}>
            Or jump straight to
          </div>
          <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                style={{
                  background: "#0a0a0a",
                  border: "1px solid #1a1a1a",
                  color: "#c5cdf5",
                  padding: "0.5rem 0.95rem",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function roleDestination(role: Role | null): string {
  switch (role) {
    case "creator":
      return "/creator";
    case "buyer":
      return "/marketplace";
    case "issuer":
      return "/marketplace/tokenize";
    case "investor":
      return "/pitch";
    default:
      return "/marketplace";
  }
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Connect wallet", "Pick role", "Learn", "Finish"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "2rem",
        padding: "0.85rem 1rem",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
      }}
    >
      {labels.map((label, i) => {
        const idx = (i + 1) as Step;
        const done = idx < step;
        const active = idx === step;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.55rem", flex: i < labels.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  background: done ? "#10b981" : active ? "#7b9cff" : "#1a1a1a",
                  color: done || active ? "#0a0a0a" : "#9a9a9a",
                  border: active ? "none" : "1px solid #2a2a2a",
                }}
              >
                {done ? "✓" : idx}
              </span>
              <span style={{ fontSize: "0.86rem", color: active ? "#fff" : "#8a8a8a", fontWeight: active ? 600 : 500 }}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 ? (
              <div style={{ flex: 1, height: 1, background: done ? "#10b981" : "#1a1a1a" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RoleCard({
  title,
  blurb,
  active,
  onClick,
}: {
  title: string;
  blurb: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: active ? "rgba(123,156,255,0.1)" : "#0f0f0f",
        border: "1px solid",
        borderColor: active ? "#7b9cff" : "#1a1a1a",
        borderRadius: 12,
        padding: "1.2rem 1.3rem",
        cursor: "pointer",
        color: "#e8e8e8",
      }}
    >
      <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.45rem" }}>{title}</h3>
      <p style={{ color: "#9a9a9a", fontSize: "0.88rem", lineHeight: 1.6 }}>{blurb}</p>
    </button>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "3rem 1.5rem 4rem",
};

const topNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "2.5rem",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  color: "#fff",
  textDecoration: "none",
};

const logoMark: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
};

const skipStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#8a8a8a",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 16,
  padding: "2.25rem 2rem",
};

const h1Style: React.CSSProperties = {
  fontSize: "clamp(1.7rem, 3.5vw, 2.2rem)",
  lineHeight: 1.15,
  letterSpacing: "-0.025em",
  fontWeight: 600,
  marginBottom: "1rem",
};

const leadStyle: React.CSSProperties = {
  fontSize: "1rem",
  color: "#b5b5b5",
  lineHeight: 1.7,
  marginTop: "0.5rem",
};

const mutedStyle: React.CSSProperties = {
  color: "#8a8a8a",
  fontSize: "0.85rem",
  lineHeight: 1.6,
};

const linkStyle: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "none",
};

const btnPrimary: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  padding: "0.7rem 1.35rem",
  borderRadius: 8,
  fontSize: "0.92rem",
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  color: "#e8e8e8",
  padding: "0.7rem 1.35rem",
  borderRadius: 8,
  fontSize: "0.92rem",
  fontWeight: 500,
  cursor: "pointer",
};

const codeInline: React.CSSProperties = {
  background: "#1a1a1a",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontFamily: "'SF Mono', Menlo, monospace",
  fontSize: "0.78rem",
  color: "#e8e8e8",
};

const greenPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  background: "rgba(16,185,129,0.12)",
  color: "#6ee7b7",
  padding: "0.4rem 0.85rem",
  borderRadius: 999,
  fontSize: "0.85rem",
  fontWeight: 500,
};
