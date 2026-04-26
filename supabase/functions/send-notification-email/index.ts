// Supabase Edge Function: send-notification-email
//
// Reads pending notification rows where:
//   email_eligible = true
//   email_sent_at IS NULL
//   recipient has a verified email in notification_preferences
//   notification.type is in the recipient's email_types allowlist (or '*')
//
// Renders a templated HTML/text email per type, sends via Resend,
// stamps email_sent_at on success. Failures are logged and retried
// next run (no row mutation).
//
// Setup (do once on production):
//   1. Apply migrations 017 + 019.
//   2. Deploy: supabase functions deploy send-notification-email --no-verify-jwt
//   3. Set function secrets:
//        RESEND_API_KEY (https://resend.com/api-keys)
//        EMAIL_FROM_ADDRESS (e.g. "Nodosol <notifications@nodosol.com>")
//        APP_URL (e.g. "https://www.nodosol.com")
//        UNSUBSCRIBE_TOKEN_SECRET (random hex; same secret as the
//          unsubscribe-email Edge Function)
//   4. Migration 019 schedules pg_cron to hit this every minute.
//
// Runtime: Deno.

import { create as createJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const BATCH_SIZE = 50;

type NotificationRow = {
  id: string;
  wallet_pubkey: string;
  type: string;
  payload: Record<string, unknown>;
  href: string | null;
  title: string;
  body: string | null;
  signature: string | null;
};

type PrefsRow = {
  wallet_pubkey: string;
  email: string | null;
  email_verified_at: string | null;
  email_types: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM_ADDRESS");
  const appUrl = Deno.env.get("APP_URL") ?? "https://www.nodosol.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const unsubSecret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET");

  if (!resendKey || !emailFrom || !supabaseUrl || !serviceKey) {
    console.error("send-notification-email misconfigured", {
      hasResend: !!resendKey,
      hasFrom: !!emailFrom,
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceKey,
    });
    return jsonError("Server misconfigured", 500);
  }
  // Unsub secret is optional — emails still ship without footer links if
  // it's not configured (logs a warning so ops notice).
  let unsubKey: CryptoKey | null = null;
  if (unsubSecret) {
    unsubKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(unsubSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  } else {
    console.warn(
      "UNSUBSCRIBE_TOKEN_SECRET not set — emails will lack one-click unsubscribe links.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Pull pending notifications.
  const { data: pending, error: pendingErr } = await supabase
    .from("notifications")
    .select("id, wallet_pubkey, type, payload, href, title, body, signature")
    .eq("email_eligible", true)
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pendingErr) {
    console.error("query pending failed", pendingErr);
    return jsonError("Query failed", 500);
  }

  const rows = (pending ?? []) as NotificationRow[];
  if (rows.length === 0) {
    return jsonOk({ sent: 0, skipped: 0 });
  }

  // Fetch prefs for the affected wallets in one query.
  const wallets = Array.from(new Set(rows.map((r) => r.wallet_pubkey)));
  const { data: prefsData } = await supabase
    .from("notification_preferences")
    .select("wallet_pubkey, email, email_verified_at, email_types")
    .in("wallet_pubkey", wallets);

  const prefsByWallet = new Map<string, PrefsRow>();
  for (const p of (prefsData ?? []) as PrefsRow[]) {
    prefsByWallet.set(p.wallet_pubkey, p);
  }

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const prefs = prefsByWallet.get(row.wallet_pubkey);
    if (!prefs || !prefs.email || !prefs.email_verified_at) {
      // No verified email — mark sent so we don't retry forever.
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    if (!isTypeAllowed(row.type, prefs.email_types)) {
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    let unsubLinks: UnsubLinks | null = null;
    if (unsubKey) {
      try {
        unsubLinks = await buildUnsubLinks(unsubKey, appUrl, row.wallet_pubkey, row.type);
      } catch (err) {
        console.warn("buildUnsubLinks failed; sending without footer links", err);
      }
    }

    const tmpl = renderEmail(row, appUrl, unsubLinks);
    const ok = await sendResend({
      apiKey: resendKey,
      from: emailFrom,
      to: prefs.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      listUnsubscribe: unsubLinks?.allUrl,
    });

    if (ok) {
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    }
    // On failure, leave email_sent_at NULL so the next run retries.
  }

  return jsonOk({ sent, skipped, total: rows.length });
});

function isTypeAllowed(type: string, allowlist: string): boolean {
  const trimmed = allowlist.trim();
  if (trimmed === "") return false;
  if (trimmed === "*") return true;
  const set = new Set(trimmed.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has(type);
}

async function sendResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  listUnsubscribe?: string | null;
}): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
    const body: Record<string, unknown> = {
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    // RFC 8058 List-Unsubscribe header for one-click unsubscribe support
    // in Gmail / Apple Mail / Outlook.
    if (opts.listUnsubscribe) {
      body.headers = {
        "List-Unsubscribe": `<${opts.listUnsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("resend send failed", res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("resend fetch threw", err);
    return false;
  }
}

type UnsubLinks = {
  /** Removes only the current notification's type. */
  typeUrl: string;
  /** Removes all notification types (kill-switch). */
  allUrl: string;
};

const UNSUB_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days — long enough for forgotten inboxes.

async function buildUnsubLinks(
  key: CryptoKey,
  appUrl: string,
  wallet: string,
  type: string,
): Promise<UnsubLinks> {
  const exp = Math.floor(Date.now() / 1000) + UNSUB_TTL_SECONDS;
  const [typeTok, allTok] = await Promise.all([
    createJwt({ alg: "HS256", typ: "JWT" }, { w: wallet, t: type, exp }, key),
    createJwt({ alg: "HS256", typ: "JWT" }, { w: wallet, t: "*", exp }, key),
  ]);
  return {
    typeUrl: `${appUrl}/u?t=${encodeURIComponent(typeTok)}`,
    allUrl: `${appUrl}/u?t=${encodeURIComponent(allTok)}`,
  };
}

type Rendered = { subject: string; html: string; text: string };

function renderEmail(
  row: NotificationRow,
  appUrl: string,
  unsubLinks: UnsubLinks | null,
): Rendered {
  const link = row.href ? `${appUrl}${row.href.startsWith("/") ? row.href : `/${row.href}`}` : appUrl;
  const subject = `[Nodosol] ${row.title}`;
  const bodyLine = row.body ?? "";

  const footerHtml = unsubLinks
    ? `You're receiving this because email notifications are enabled for ${escapeHtml(shortenWallet(row.wallet_pubkey))}.<br/>
          <a href="${escapeAttr(`${appUrl}/settings/notifications`)}" style="color:#7c8694;">Manage preferences</a> ·
          <a href="${escapeAttr(unsubLinks.typeUrl)}" style="color:#7c8694;">Unsubscribe from ${escapeHtml(row.type)}</a> ·
          <a href="${escapeAttr(unsubLinks.allUrl)}" style="color:#7c8694;">Unsubscribe from all</a>`
    : `You're receiving this because email notifications are enabled for ${escapeHtml(shortenWallet(row.wallet_pubkey))}.<br/>
          <a href="${escapeAttr(`${appUrl}/settings/notifications`)}" style="color:#7c8694;">Manage preferences</a>`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#eef0f3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#11141a;border:1px solid #1f242d;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #1f242d;">
          <div style="font-size:14px;color:#7c8694;letter-spacing:0.04em;text-transform:uppercase;">Nodosol</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#eef0f3;">${escapeHtml(row.title)}</h1>
          ${bodyLine ? `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#c5cbd4;">${escapeHtml(bodyLine)}</p>` : ""}
          <a href="${escapeAttr(link)}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Open in Nodosol</a>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #1f242d;font-size:12px;color:#7c8694;">
          ${footerHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [
    row.title,
    bodyLine,
    "",
    `Open: ${link}`,
    "",
    `Manage preferences: ${appUrl}/settings/notifications`,
  ];
  if (unsubLinks) {
    textLines.push(`Unsubscribe from ${row.type}: ${unsubLinks.typeUrl}`);
    textLines.push(`Unsubscribe from all: ${unsubLinks.allUrl}`);
  }
  const text = textLines.filter(Boolean).join("\n");

  return { subject, html, text };
}

function shortenWallet(pubkey: string): string {
  if (pubkey.length <= 10) return pubkey;
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
