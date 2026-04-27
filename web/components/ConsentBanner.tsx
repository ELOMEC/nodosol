"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * S1 — Analytics consent banner.
 *
 * Only mounts when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (no GA → no
 * banner). Renders nothing if the user has already chosen, and skips
 * re-prompting for 14 days after a Decline so we don't nag.
 *
 * Accept → `gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied' })`
 * Decline → consent stays denied + we set the cool-off flag.
 *
 * We grant only `analytics_storage` (page-view measurement) — we never
 * flip ad_storage / ad_personalization / ad_user_data to granted
 * because we don't run ads. Documented in /privacy.
 */

const CHOICE_KEY = "nodosol_analytics_consent";
const DECLINE_TTL_DAYS = 14;
const ACCEPT_TTL_DAYS = 365;

type Choice = "accepted" | "declined";

type StoredChoice = {
  choice: Choice;
  /** Unix ms when the choice was made. */
  at: number;
};

function loadChoice(): StoredChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChoice;
    if (parsed?.choice !== "accepted" && parsed?.choice !== "declined") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistChoice(choice: Choice): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredChoice = { choice, at: Date.now() };
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(stored));
  } catch {
    // ignore — quota / private mode
  }
}

function isFresh(stored: StoredChoice): boolean {
  const ttl = stored.choice === "accepted" ? ACCEPT_TTL_DAYS : DECLINE_TTL_DAYS;
  const ageMs = Date.now() - stored.at;
  return ageMs < ttl * 24 * 60 * 60 * 1000;
}

function dntActive(): boolean {
  if (typeof navigator === "undefined") return false;
  type DNTNav = Navigator & { msDoNotTrack?: string };
  const dnt = navigator.doNotTrack ?? (navigator as DNTNav).msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

type GtagFn = (
  command: "consent",
  action: "update",
  params: Record<string, "granted" | "denied">,
) => void;

function gtagUpdate(granted: boolean): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { gtag?: GtagFn };
  if (typeof w.gtag !== "function") return;
  w.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    // We never run ads — keep ad-related consent denied even on accept.
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return;
    if (dntActive()) {
      // Browser asked us not to track — stay denied, don't show banner.
      gtagUpdate(false);
      return;
    }
    const stored = loadChoice();
    if (stored && isFresh(stored)) {
      // Re-apply prior choice on every page load so a fresh tab still
      // sees the right consent state.
      gtagUpdate(stored.choice === "accepted");
      return;
    }
    // Small delay so the banner doesn't fight with first paint.
    const t = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const accept = () => {
    gtagUpdate(true);
    persistChoice("accepted");
    setVisible(false);
  };
  const decline = () => {
    gtagUpdate(false);
    persistChoice("declined");
    setVisible(false);
  };

  return (
    <div role="dialog" aria-live="polite" aria-label="Analytics consent" style={SHELL}>
      <div style={CARD}>
        <div style={TEXT_WRAP}>
          <div style={TITLE}>Help us improve nodosol?</div>
          <div style={BODY}>
            We&apos;d love to count anonymous visits + which pages people
            land on. Nothing is joined to your wallet, and we don&apos;t
            run ads. Read the full breakdown in our{" "}
            <Link href="/privacy" style={LINK}>
              privacy policy
            </Link>
            .
          </div>
        </div>
        <div style={ACTIONS}>
          <button type="button" onClick={decline} style={SECONDARY_BTN}>
            Decline
          </button>
          <button type="button" onClick={accept} style={PRIMARY_BTN}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

const SHELL: React.CSSProperties = {
  position: "fixed",
  bottom: "1rem",
  left: "1rem",
  right: "1rem",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 80,
};

const CARD: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  maxWidth: 640,
  width: "100%",
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 12,
  padding: "0.85rem 1rem",
  color: "#eef0f3",
  boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  flexWrap: "wrap",
};

const TEXT_WRAP: React.CSSProperties = {
  flex: "1 1 280px",
  minWidth: 0,
};

const TITLE: React.CSSProperties = {
  fontSize: "0.92rem",
  fontWeight: 600,
  marginBottom: "0.2rem",
};

const BODY: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#c5cbd4",
  lineHeight: 1.4,
};

const ACTIONS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  flexShrink: 0,
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.84rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "#c5cbd4",
  border: "1px solid #2a2f3a",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.84rem",
  cursor: "pointer",
};

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};
