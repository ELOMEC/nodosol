"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const FLAG_KEY = "nodosol_tour_completed";

type Step = {
  title: string;
  body: string;
  primary?: { label: string; href?: string };
  secondary?: { label: string; href?: string };
};

const STEPS: Step[] = [
  {
    title: "Welcome to Nodosol",
    body:
      "A 4-step tour so you know where things live. You can skip any time — we won't ask twice.",
  },
  {
    title: "Step 1 · Connect a wallet",
    body:
      "Click the wallet button (top-right or the “Get started” CTA) and pick Phantom, Backpack, or sign in with Privy email. Your keys stay in your wallet — Nodosol never sees them.",
    primary: { label: "Open Get started", href: "/welcome" },
  },
  {
    title: "Step 2 · Fund with USDC",
    body:
      "Devnet has a faucet inside /welcome — one click drops mock USDC into the connected wallet. On mainnet, on-ramp via Privy or transfer USDC from any Solana wallet.",
    primary: { label: "Devnet faucet", href: "/welcome" },
  },
  {
    title: "Step 3 · Browse the marketplace",
    body:
      "Tickets, sealed-bid auctions, rentals, RWA assets, and the OTC desk all live under one roof. Tap the heart to save anything for later.",
    primary: { label: "Open marketplace", href: "/marketplace" },
  },
  {
    title: "You're set",
    body:
      "Tip a creator, buy a ticket, or list your first asset. Notification bell pings you on every match — preferences live in /settings/notifications.",
    primary: { label: "Browse creators", href: "/creators" },
    secondary: { label: "Settings", href: "/settings/notifications" },
  },
];

function isCompleted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return true;
  }
}

function markCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * Renders nothing on the server and on revisits. On first visit (per
 * localStorage), shows a 4-step overlay walking through Connect →
 * Fund → Browse → Done. Skip / Don't show again both flip the flag.
 *
 * Mount this on `/` and `/marketplace` only — that's where new
 * visitors land.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isCompleted()) {
      // Small delay so the page paints first; the overlay never feels
      // like it gates the actual content.
      const t = window.setTimeout(() => setOpen(true), 400);
      return () => window.clearTimeout(t);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    markCompleted();
    setOpen(false);
  };

  const last = step >= STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nodosol-tour-title"
      style={SHELL}
      onClick={(e) => {
        if (e.currentTarget === e.target) dismiss();
      }}
    >
      <div style={CARD}>
        <div style={HEADER}>
          <span style={DOT_TEXT}>
            {step + 1} / {STEPS.length}
          </span>
          <button type="button" onClick={dismiss} style={SKIP_BTN} aria-label="Skip and don't show again">
            Skip · don&apos;t show again
          </button>
        </div>
        <h2 id="nodosol-tour-title" style={TITLE}>
          {current.title}
        </h2>
        <p style={BODY}>{current.body}</p>

        <div style={DOTS}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                ...DOT,
                background: i === step ? "#7b9cff" : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>

        <div style={ACTIONS}>
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ ...SECONDARY_BTN, opacity: step === 0 ? 0.4 : 1, cursor: step === 0 ? "default" : "pointer" }}
          >
            Back
          </button>
          <div style={{ display: "flex", gap: "0.55rem" }}>
            {current.secondary?.href ? (
              <Link href={current.secondary.href} style={SECONDARY_BTN} onClick={dismiss}>
                {current.secondary.label}
              </Link>
            ) : null}
            {current.primary?.href ? (
              <Link
                href={current.primary.href}
                style={PRIMARY_BTN}
                onClick={() => {
                  if (last) dismiss();
                }}
              >
                {current.primary.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (last) dismiss();
                else setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
              style={PRIMARY_BTN}
            >
              {last ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SHELL: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  background: "rgba(11,13,18,0.78)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  zIndex: 9999,
};

const CARD: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 14,
  padding: "1.65rem 1.65rem 1.4rem",
  color: "#eef0f3",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  boxShadow: "0 25px 70px rgba(0,0,0,0.55)",
};

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1.1rem",
};

const DOT_TEXT: React.CSSProperties = {
  fontSize: "0.78rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "#7c8694",
  fontWeight: 600,
};

const SKIP_BTN: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#7c8694",
  fontSize: "0.78rem",
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};

const TITLE: React.CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 600,
  marginBottom: "0.55rem",
  letterSpacing: 0,
};

const BODY: React.CSSProperties = {
  fontSize: "0.95rem",
  lineHeight: 1.55,
  color: "#c5cbd4",
  marginBottom: "1.1rem",
};

const DOTS: React.CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  marginBottom: "1.2rem",
};

const DOT: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
};

const ACTIONS: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.05rem",
  fontSize: "0.86rem",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "#eef0f3",
  border: "1px solid #2a2f3a",
  borderRadius: 8,
  padding: "0.55rem 1.05rem",
  fontSize: "0.86rem",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};
