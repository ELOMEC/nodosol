"use client";

import { useCallback, useState } from "react";

import { getSupabaseUrl } from "@/lib/supabase";

type Role = "" | "creator" | "buyer" | "issuer" | "investor";

type Props = {
  /** Free-form tag passed back to the Edge Function so we can attribute
   *  signups across multiple landing surfaces (page.tsx, /pitch, /welcome). */
  source?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; position?: number }
  | { kind: "error"; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ROLE_OPTIONS: ReadonlyArray<{ value: Exclude<Role, "">; label: string }> = [
  { value: "creator", label: "Creator" },
  { value: "buyer", label: "Buyer" },
  { value: "issuer", label: "Issuer" },
  { value: "investor", label: "Investor" },
];

export function WaitlistForm({ source = "landing" }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!EMAIL_RE.test(trimmed)) {
        setStatus({ kind: "error", message: "Please enter a valid email address." });
        return;
      }
      setStatus({ kind: "submitting" });
      try {
        const resp = await fetch(`${getSupabaseUrl()}/functions/v1/waitlist-signup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            source,
            role: role || undefined,
            referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
          }),
        });
        const payload = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          position?: number;
          error?: string;
        };
        if (!resp.ok || !payload.ok) {
          setStatus({
            kind: "error",
            message: payload.error ?? `Signup failed (HTTP ${resp.status}).`,
          });
          return;
        }
        setStatus({ kind: "success", position: payload.position });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error — try again.",
        });
      }
    },
    [email, role, source],
  );

  if (status.kind === "success") {
    return (
      <div style={successStyle}>
        <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
          You&apos;re on the list.
        </div>
        <div style={{ fontSize: "0.88rem", color: "#9a9a9a" }}>
          {typeof status.position === "number"
            ? `You're #${status.position} on the list — we'll email you before mainnet launch.`
            : "We'll email you before mainnet launch."}
        </div>
      </div>
    );
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} style={formStyle}>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          style={inputStyle}
          aria-label="Email address"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={submitting}
          style={selectStyle}
          aria-label="Your role (optional)"
        >
          <option value="">I am… (optional)</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
          {submitting ? "Joining…" : "Join waitlist"}
        </button>
      </div>
      {status.kind === "error" ? (
        <div role="alert" style={errorStyle}>
          {status.message}
        </div>
      ) : null}
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

const inputStyle: React.CSSProperties = {
  flex: "2 1 220px",
  minWidth: 0,
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  padding: "0.7rem 0.9rem",
  color: "#fafafa",
  fontSize: "0.92rem",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  flex: "1 1 160px",
  background: "#0f0f0f",
  border: "1px solid #1a1a1a",
  borderRadius: 8,
  padding: "0.7rem 0.9rem",
  color: "#fafafa",
  fontSize: "0.9rem",
  outline: "none",
  cursor: "pointer",
};

function buttonStyle(submitting: boolean): React.CSSProperties {
  return {
    background: "#7b9cff",
    color: "#0a0a0a",
    border: "none",
    padding: "0.7rem 1.25rem",
    borderRadius: 8,
    fontSize: "0.92rem",
    fontWeight: 600,
    cursor: submitting ? "not-allowed" : "pointer",
    opacity: submitting ? 0.7 : 1,
  };
}

const successStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #2a3a6a",
  borderRadius: 12,
  padding: "1.1rem 1.25rem",
};

const errorStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#f87171",
};
