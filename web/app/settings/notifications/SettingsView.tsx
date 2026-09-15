"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  getCachedChatJwt,
  setCachedChatJwt,
} from "@/lib/chatSession";
import {
  EMAIL_ELIGIBLE_DEFAULT_TYPES,
  EMAIL_TYPE_GROUPS,
  NotificationPrefsRow,
  fetchPrefs,
  isValidEmail,
  parseEmailTypes,
  requestVerifyEmail,
  serializeEmailTypes,
  upsertPrefs,
} from "@/lib/notificationPrefs";
import { requestChatJwt } from "@/lib/supabase";

const JWT_REFRESH_SLACK_S = 60;

export function SettingsView() {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<NotificationPrefsRow | null>(null);
  const [email, setEmail] = useState("");
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const ensureJwt = useCallback(async (): Promise<string> => {
    if (!wallet || !signMessage) {
      throw new Error("Connect a wallet that supports message signing.");
    }
    const now = Math.floor(Date.now() / 1000);
    const cached = getCachedChatJwt(wallet);
    if (cached && cached.expiresAt - now > JWT_REFRESH_SLACK_S) {
      return cached.jwt;
    }
    const timestamp = Date.now();
    const message = `nodosol-chat-auth:v1:${wallet}:${timestamp}`;
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    const { jwt, expiresAt } = await requestChatJwt({
      wallet,
      message,
      signatureBase58: bs58.encode(sigBytes),
    });
    setCachedChatJwt(wallet, { jwt, expiresAt });
    return jwt;
  }, [wallet, signMessage]);

  const load = useCallback(async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const jwt = await ensureJwt();
      const row = await fetchPrefs(jwt);
      setExisting(row);
      if (row) {
        setEmail(row.email ?? "");
        setEnabledTypes(parseEmailTypes(row.email_types));
      } else {
        // Sensible default: email opt-in disabled until user provides
        // an address, but pre-tick the eligible types so it's a one-step
        // flip once they fill in the email.
        setEmail("");
        setEnabledTypes(new Set(EMAIL_ELIGIBLE_DEFAULT_TYPES));
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [wallet, ensureJwt, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const verified = !!existing?.email_verified_at;
  const hasEmail = email.trim().length > 0;
  const emailValid = useMemo(
    () => (hasEmail ? isValidEmail(email.trim()) : true),
    [email, hasEmail]
  );

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onAllToggle = (label: string, types: string[], turnOn: boolean) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      for (const t of types) {
        if (turnOn) next.add(t);
        else next.delete(t);
      }
      return next;
    });
    toast.info(turnOn ? `Enabled all ${label}` : `Disabled all ${label}`);
  };

  async function sendVerify() {
    if (!wallet || !signMessage) {
      toast.error("Connect a wallet that supports message signing.");
      return;
    }
    const target = email.trim().toLowerCase();
    if (!isValidEmail(target)) {
      toast.error("Save a valid email first.");
      return;
    }
    setVerifyBusy(true);
    try {
      const timestamp = Date.now();
      const message = `nodosol-verify-email:v1:${wallet}:${target}:${timestamp}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const result = await requestVerifyEmail({
        wallet,
        email: target,
        message,
        signatureBase58: bs58.encode(sigBytes),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.alreadyVerified) {
        toast.success("This email is already verified");
      } else {
        toast.success("Verification email sent — check your inbox");
      }
      // Refresh so we pick up the new email_verification_sent_at stamp.
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function save() {
    if (!wallet) return;
    if (hasEmail && !emailValid) {
      toast.error("That email looks invalid");
      return;
    }
    setBusy(true);
    try {
      const jwt = await ensureJwt();
      const result = await upsertPrefs(wallet, jwt, {
        email: hasEmail ? email.trim() : null,
        email_types: serializeEmailTypes(enabledTypes),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setExisting(result.row);
      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <div style={{ padding: "2.5rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Notification settings</h1>
        <p style={SUBTITLE}>
          Connect a wallet to choose how Nodosol pings you when on-chain
          events affect your account.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={{ padding: "1.75rem 0", maxWidth: 720 }}>
      <header style={{ marginBottom: "1.75rem" }}>
        <h1 style={H1}>Notification settings</h1>
        <p style={SUBTITLE}>
          Email is only sent when you have a verified address and the
          notification type is in your allowlist below.
        </p>
      </header>

      {loading ? (
        <p style={{ color: "var(--shell-muted)" }}>Loading…</p>
      ) : (
        <>
          <section style={CARD}>
            <h2 style={H2}>Email address</h2>
            <p style={CARD_HELP}>
              Used for digest-style alerts on the events you've ticked
              below. We never share or sell — see <a href="/security" style={LINK}>/security</a>.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={INPUT}
              spellCheck={false}
              autoComplete="email"
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.55rem" }}>
              {hasEmail && existing?.email && existing.email === email.trim().toLowerCase() ? (
                verified ? (
                  <span style={BADGE_OK}>✓ Verified</span>
                ) : (
                  <>
                    <span style={BADGE_WARN}>Not verified</span>
                    <button
                      type="button"
                      style={LINK_BTN}
                      onClick={() => void sendVerify()}
                      disabled={verifyBusy}
                    >
                      {verifyBusy ? "Sending…" : "Send verification email"}
                    </button>
                  </>
                )
              ) : hasEmail && !emailValid ? (
                <span style={BADGE_WARN}>Looks invalid</span>
              ) : (
                <span style={CARD_HELP_INLINE}>
                  Save first, then verify on the next visit.
                </span>
              )}
            </div>
          </section>

          {EMAIL_TYPE_GROUPS.map((group) => {
            const groupKeys = group.types.map((t) => t.key);
            const allOn = groupKeys.every((k) => enabledTypes.has(k));
            return (
              <section key={group.label} style={CARD}>
                <div style={CARD_HEAD}>
                  <div>
                    <h2 style={H2}>{group.label}</h2>
                    <p style={CARD_HELP}>{group.description}</p>
                  </div>
                  <button
                    type="button"
                    style={LINK_BTN}
                    onClick={() => onAllToggle(group.label, groupKeys, !allOn)}
                  >
                    {allOn ? "Turn all off" : "Turn all on"}
                  </button>
                </div>
                <ul style={LIST}>
                  {group.types.map((t) => (
                    <li key={t.key} style={LIST_ITEM}>
                      <label style={LABEL_ROW}>
                        <input
                          type="checkbox"
                          checked={enabledTypes.has(t.key)}
                          onChange={() => toggleType(t.key)}
                          style={{ width: 16, height: 16 }}
                        />
                        <span>
                          <span style={LIST_LABEL}>{t.label}</span>
                          {t.help && <span style={LIST_HELP}>{t.help}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              style={SECONDARY_BTN}
            >
              Discard changes
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || (hasEmail && !emailValid)}
              style={PRIMARY_BTN}
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>

          <p style={{ ...CARD_HELP, marginTop: "1rem", fontSize: "0.78rem" }}>
            Wallet: <code style={{ fontSize: "0.78rem" }}>{wallet.slice(0, 4)}…{wallet.slice(-4)}</code> · Settings sync to the{" "}
            <code style={{ fontSize: "0.78rem" }}>notification_preferences</code> row gated by your wallet signature.
          </p>
        </>
      )}
    </div>
  );
}

const H1: React.CSSProperties = {
  fontSize: "1.55rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
  color: "var(--shell-fg)",
};

const H2: React.CSSProperties = {
  fontSize: "1.05rem",
  fontWeight: 600,
  marginBottom: "0.25rem",
  color: "var(--shell-fg)",
};

const SUBTITLE: React.CSSProperties = {
  color: "var(--shell-muted)",
  marginBottom: "1.25rem",
  lineHeight: 1.5,
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1.1rem 1.2rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card-bg)",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  marginBottom: "0.5rem",
};

const CARD_HELP: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
  marginBottom: "0.75rem",
  lineHeight: 1.5,
};

const CARD_HELP_INLINE: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  background: "var(--shell-input-bg)",
  color: "var(--shell-fg)",
  fontSize: "0.9rem",
};

const BADGE_OK: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#10b981",
  background: "rgba(16,185,129,0.12)",
  padding: "0.18rem 0.5rem",
  borderRadius: 999,
};

const BADGE_WARN: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#f59e0b",
  background: "rgba(245,158,11,0.12)",
  padding: "0.18rem 0.5rem",
  borderRadius: 999,
};

const LIST: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const LIST_ITEM: React.CSSProperties = {
  borderTop: "1px solid var(--shell-border)",
  paddingTop: "0.5rem",
};

const LABEL_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  cursor: "pointer",
  fontSize: "0.9rem",
  color: "var(--shell-fg)",
};

const LIST_LABEL: React.CSSProperties = {
  display: "block",
  fontWeight: 500,
};

const LIST_HELP: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  color: "var(--shell-muted)",
  marginTop: "0.15rem",
};

const LINK: React.CSSProperties = {
  color: "var(--shell-accent)",
  textDecoration: "underline",
};

const LINK_BTN: React.CSSProperties = {
  fontSize: "0.82rem",
  background: "transparent",
  border: "none",
  color: "var(--shell-accent)",
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "var(--shell-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontSize: "0.9rem",
  cursor: "pointer",
};
