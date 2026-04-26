"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "nodosol_install_dismissed_at";
const DISMISS_TTL_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
};

function isiOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari standalone flag
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    const ageMs = Date.now() - at;
    return ageMs < DISMISS_TTL_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Surfaces the platform install affordance:
 * - Chromium / Edge / Samsung Internet: deferred `beforeinstallprompt`
 *   event triggers a banner with an Install button that calls
 *   `prompt()` on user activation.
 * - iOS Safari: shows a one-line hint pointing at the Share → "Add to
 *   Home Screen" flow (Apple disallows programmatic install).
 *
 * Already-installed (display-mode: standalone) and recently-dismissed
 * (14d cool-off) sessions render nothing. Service worker registration
 * happens here too — cheap and we already check standalone state.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  // Register the service worker once per session (idempotent on the browser side).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Don't block render — fire and forget.
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("sw register failed", err);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    if (isiOS()) {
      setIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installed = () => {
      setDeferred(null);
      markDismissed();
    };
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!deferred && !iosHint) return null;

  const dismiss = () => {
    markDismissed();
    setDeferred(null);
    setIosHint(false);
  };

  const onInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome !== "dismissed") {
      setDeferred(null);
    }
    markDismissed();
  };

  return (
    <div style={SHELL} role="status">
      <div style={CARD}>
        <div style={ICON}>↧</div>
        <div style={TEXT_WRAP}>
          <div style={TITLE}>
            {iosHint ? "Add Nodosol to Home Screen" : "Install Nodosol"}
          </div>
          <div style={BODY}>
            {iosHint
              ? "Tap the Share icon, then “Add to Home Screen” for a full-screen, one-tap launch."
              : "One-click install for a faster, full-screen experience. Notifications + camera access unlock too."}
          </div>
        </div>
        <div style={ACTIONS}>
          {!iosHint ? (
            <button type="button" onClick={() => void onInstall()} style={PRIMARY_BTN}>
              Install
            </button>
          ) : null}
          <button type="button" onClick={dismiss} style={DISMISS_BTN} aria-label="Dismiss">
            ×
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
  zIndex: 90,
};

const CARD: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  maxWidth: 540,
  width: "100%",
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 12,
  padding: "0.75rem 0.85rem",
  color: "#eef0f3",
  boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const ICON: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  fontWeight: 700,
  flexShrink: 0,
};

const TEXT_WRAP: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const TITLE: React.CSSProperties = {
  fontSize: "0.92rem",
  fontWeight: 600,
  marginBottom: "0.15rem",
};

const BODY: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "#c5cbd4",
  lineHeight: 1.4,
};

const ACTIONS: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  flexShrink: 0,
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "#7b9cff",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 8,
  padding: "0.45rem 0.95rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

const DISMISS_BTN: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #2a2f3a",
  color: "#c5cbd4",
  width: 28,
  height: 28,
  borderRadius: 8,
  fontSize: "1rem",
  lineHeight: 1,
  cursor: "pointer",
};
