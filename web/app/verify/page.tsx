import Link from "next/link";

import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase";

type ConfirmResult =
  | { ok: true; wallet: string; email: string }
  | { ok: false; status: number; error: string };

async function confirmToken(token: string): Promise<ConfirmResult> {
  try {
    const url = new URL("/functions/v1/verify-email", getSupabaseUrl());
    url.searchParams.set("token", token);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: getSupabaseAnonKey(),
        authorization: `Bearer ${getSupabaseAnonKey()}`,
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as
      | { ok: true; wallet: string; email: string }
      | { ok?: false; error?: string };
    if (res.ok && "ok" in json && json.ok) {
      return { ok: true, wallet: json.wallet, email: json.email };
    }
    return {
      ok: false,
      status: res.status,
      error:
        (typeof json === "object" && json && "error" in json && (json as { error?: string }).error) ||
        `Verification failed (HTTP ${res.status})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export const metadata = {
  title: "Confirm email · Nodosol",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  const result = token ? await confirmToken(token) : null;

  return (
    <div style={SHELL}>
      <div style={CARD}>
        <div style={LOGO}>nodosol</div>
        {!token ? (
          <>
            <h1 style={H1}>Missing token</h1>
            <p style={SUB}>
              The verification link is incomplete. Request a fresh one from the{" "}
              <Link href="/settings/notifications" style={LINK}>
                notification settings
              </Link>{" "}
              page.
            </p>
          </>
        ) : result?.ok ? (
          <>
            <h1 style={H1}>Email confirmed</h1>
            <p style={SUB}>
              <code style={MONO}>{shortWallet(result.wallet)}</code> will now
              receive selected on-chain notifications at{" "}
              <strong>{result.email}</strong>.
            </p>
            <Link href="/settings/notifications" style={BUTTON_PRIMARY}>
              Open settings
            </Link>
          </>
        ) : result ? (
          <>
            <h1 style={H1}>Couldn&apos;t confirm</h1>
            <p style={SUB}>{result.error}</p>
            <Link href="/settings/notifications" style={BUTTON_PRIMARY}>
              Request a new link
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function shortWallet(pubkey: string): string {
  return pubkey.length > 10 ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}` : pubkey;
}

const SHELL: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0b0d12",
  color: "#eef0f3",
  padding: "2rem 1rem",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const CARD: React.CSSProperties = {
  maxWidth: 480,
  width: "100%",
  background: "#11141a",
  border: "1px solid #1f242d",
  borderRadius: 14,
  padding: "2rem 1.85rem",
  textAlign: "center" as const,
};

const LOGO: React.CSSProperties = {
  fontSize: "0.78rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#7c8694",
  marginBottom: "1.4rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 600,
  marginBottom: "0.6rem",
};

const SUB: React.CSSProperties = {
  color: "#c5cbd4",
  fontSize: "0.95rem",
  lineHeight: 1.55,
  marginBottom: "1.4rem",
};

const LINK: React.CSSProperties = {
  color: "#7c5cff",
  textDecoration: "underline",
};

const MONO: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.9em",
};

const BUTTON_PRIMARY: React.CSSProperties = {
  display: "inline-block",
  background: "#7c5cff",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.92rem",
  padding: "0.65rem 1.25rem",
  borderRadius: 8,
};
