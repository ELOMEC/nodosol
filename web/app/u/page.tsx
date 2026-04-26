import Link from "next/link";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";

type UnsubResult =
  | { ok: true; scope: string; email: string | null }
  | { ok: false; status: number; error: string };

async function callUnsubscribe(token: string): Promise<UnsubResult> {
  try {
    const url = new URL("/functions/v1/unsubscribe-email", getSupabaseUrl());
    url.searchParams.set("t", token);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: getSupabaseAnonKey(),
        authorization: `Bearer ${getSupabaseAnonKey()}`,
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as
      | { ok: true; scope: string; email: string | null }
      | { ok?: false; error?: string };
    if (res.ok && "ok" in json && json.ok) {
      return {
        ok: true,
        scope: (json as { scope: string }).scope,
        email: (json as { email: string | null }).email,
      };
    }
    return {
      ok: false,
      status: res.status,
      error:
        (typeof json === "object" && json && "error" in json && (json as { error?: string }).error) ||
        `Unsubscribe failed (HTTP ${res.status})`,
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
  title: "Unsubscribe · Nodosol",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.t;
  const token = Array.isArray(raw) ? raw[0] : raw;

  const result = token ? await callUnsubscribe(token) : null;

  return (
    <div style={SHELL}>
      <div style={CARD}>
        <div style={LOGO}>nodosol</div>
        {!token ? (
          <>
            <h1 style={H1}>Missing token</h1>
            <p style={SUB}>
              The unsubscribe link is incomplete. You can manage all email
              preferences from the{" "}
              <Link href="/settings/notifications" style={LINK}>
                notification settings
              </Link>{" "}
              page instead.
            </p>
          </>
        ) : result?.ok ? (
          <>
            <h1 style={H1}>Unsubscribed</h1>
            <p style={SUB}>
              {result.scope === "all" ? (
                <>
                  You won&apos;t receive any further notification emails
                  {result.email ? ` at ${result.email}` : ""}. Re-enable in{" "}
                  <Link href="/settings/notifications" style={LINK}>
                    settings
                  </Link>{" "}
                  whenever you like.
                </>
              ) : (
                <>
                  No more <strong>{result.scope}</strong> emails
                  {result.email ? ` to ${result.email}` : ""}. Manage other
                  notification types in{" "}
                  <Link href="/settings/notifications" style={LINK}>
                    settings
                  </Link>
                  .
                </>
              )}
            </p>
            <Link href="/settings/notifications" style={BUTTON_PRIMARY}>
              Open settings
            </Link>
          </>
        ) : result ? (
          <>
            <h1 style={H1}>Couldn&apos;t unsubscribe</h1>
            <p style={SUB}>{result.error}</p>
            <Link href="/settings/notifications" style={BUTTON_PRIMARY}>
              Manage in settings
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
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
