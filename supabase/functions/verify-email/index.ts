// Supabase Edge Function: verify-email
//
// Two operations on the same function:
//
// 1. POST /functions/v1/verify-email
//    Body: { wallet, email, message, signature }
//    Challenge: "nodosol-verify-email:v1:<wallet>:<email>:<timestampMs>"
//    - Verifies ed25519 signature against wallet pubkey
//    - Rate-limits to one send per hour per wallet
//    - Generates a 32-byte hex token, upserts notification_preferences
//      with the new email + email_verification_token + email_verification_sent_at
//    - Sends a verification email via Resend with link to APP_URL/verify?token=...
//    - Returns { ok: true } (does NOT echo token — only the email recipient sees it)
//
// 2. GET /functions/v1/verify-email?token=<hex>
//    - Looks up the row by email_verification_token (partial index 020)
//    - Ensures email_verification_sent_at is within VERIFY_TTL_MS
//    - Sets email_verified_at = now(), nulls out token + sent_at
//    - Returns { ok: true, wallet, email }
//    - Used by /verify Next route handler so the user-visible page is
//      a Next-rendered status page rather than a raw JSON dump.
//
// Setup (do once):
//   supabase functions deploy verify-email --no-verify-jwt
//   Secrets needed (already set for send-notification-email):
//     RESEND_API_KEY, EMAIL_FROM_ADDRESS, APP_URL
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY auto-injected.
//
// Apply migration 020 in Supabase SQL editor before deploying.
//
// Runtime: Deno.

import nacl from "https://esm.sh/tweetnacl@1.0.3";
import bs58 from "https://esm.sh/bs58@5.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const CHALLENGE_MAX_AGE_MS = 2 * 60 * 1000; // 2 min
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 h between sends per wallet
const TOKEN_BYTES = 32;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SendPayload = {
  wallet: string;
  email: string;
  message: string;
  signature: string;
};

async function logSecurityEvent(
  url: string,
  serviceKey: string,
  req: Request,
  event: {
    type: string;
    severity?: "info" | "warn" | "error";
    wallet?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const { error } = await admin.from("security_events").insert({
      event_type: event.type,
      severity: event.severity ?? "info",
      wallet: event.wallet ?? null,
      client_ip: clientIp,
      details: event.details ?? {},
    });
    if (error) console.warn("security_events insert failed:", error.message);
  } catch (err) {
    console.warn("security_events logger threw", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!sbUrl || !sbKey) {
    return jsonResp({ error: "Server misconfigured" }, 500);
  }

  if (req.method === "GET") {
    return handleConfirm(req, sbUrl, sbKey);
  }
  if (req.method === "POST") {
    return handleSend(req, sbUrl, sbKey);
  }
  return jsonResp({ error: "Method not allowed" }, 405);
});

async function handleSend(
  req: Request,
  sbUrl: string,
  sbKey: string,
): Promise<Response> {
  let payload: SendPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400);
  }
  const { wallet, email, message, signature } = payload;
  if (
    typeof wallet !== "string" ||
    typeof email !== "string" ||
    typeof message !== "string" ||
    typeof signature !== "string"
  ) {
    return jsonResp({ error: "Missing fields" }, 400);
  }

  const normalisedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalisedEmail)) {
    return jsonResp({ error: "Invalid email" }, 400);
  }

  // 1. Signature verify.
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = bs58.decode(wallet);
    sigBytes = bs58.decode(signature);
  } catch {
    return jsonResp({ error: "Invalid base58 pubkey or signature" }, 400);
  }
  if (pubkeyBytes.length !== 32 || sigBytes.length !== 64) {
    return jsonResp({ error: "Wrong pubkey/signature length" }, 400);
  }
  const messageBytes = new TextEncoder().encode(message);
  const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!valid) {
    await logSecurityEvent(sbUrl, sbKey, req, {
      type: "sig_verify_fail",
      severity: "warn",
      wallet,
      details: { endpoint: "verify-email" },
    });
    return jsonResp({ error: "Bad signature" }, 401);
  }

  // 2. Challenge format: nodosol-verify-email:v1:<wallet>:<email>:<timestampMs>
  const parts = message.split(":");
  if (parts.length !== 5 || parts[0] !== "nodosol-verify-email" || parts[1] !== "v1") {
    return jsonResp({ error: "Bad challenge format" }, 400);
  }
  if (parts[2] !== wallet || parts[3].toLowerCase() !== normalisedEmail) {
    return jsonResp({ error: "Wallet/email/challenge mismatch" }, 400);
  }
  const ts = Number(parts[4]);
  if (!Number.isFinite(ts)) return jsonResp({ error: "Bad timestamp" }, 400);
  const age = Date.now() - ts;
  if (age < -60_000 || age > CHALLENGE_MAX_AGE_MS) {
    await logSecurityEvent(sbUrl, sbKey, req, {
      type: "challenge_expired",
      severity: "warn",
      wallet,
      details: { endpoint: "verify-email" },
    });
    return jsonResp({ error: "Challenge expired — re-sign" }, 401);
  }

  // 3. Rate-limit: 1 send per hour per wallet.
  const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data: existingRow } = await admin
    .from("notification_preferences")
    .select("email_verification_sent_at, email_verified_at, email")
    .eq("wallet_pubkey", wallet)
    .maybeSingle();
  if (existingRow?.email_verification_sent_at) {
    const sentAt = new Date(existingRow.email_verification_sent_at).getTime();
    if (Date.now() - sentAt < RATE_LIMIT_MS) {
      await logSecurityEvent(sbUrl, sbKey, req, {
        type: "rate_limit_hit",
        severity: "warn",
        wallet,
        details: { endpoint: "verify-email", limit: "1/h" },
      });
      return jsonResp(
        { error: "Verification email already sent recently — wait an hour" },
        429,
      );
    }
  }

  // If the email being verified is already verified, short-circuit.
  if (
    existingRow?.email_verified_at &&
    existingRow.email?.toLowerCase() === normalisedEmail
  ) {
    return jsonResp({ ok: true, alreadyVerified: true });
  }

  // 4. Issue token + send email.
  const token = randomHex(TOKEN_BYTES);
  const nowIso = new Date().toISOString();
  const { error: upsertErr } = await admin
    .from("notification_preferences")
    .upsert(
      {
        wallet_pubkey: wallet,
        email: normalisedEmail,
        // Reset verified state when changing email — must re-verify.
        email_verified_at:
          existingRow?.email?.toLowerCase() === normalisedEmail
            ? existingRow.email_verified_at
            : null,
        email_verification_token: token,
        email_verification_sent_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "wallet_pubkey" },
    );
  if (upsertErr) {
    console.error("upsert failed", upsertErr);
    return jsonResp({ error: "Server error" }, 500);
  }

  const sent = await sendVerifyEmail({
    to: normalisedEmail,
    wallet,
    token,
    appUrl: Deno.env.get("APP_URL") ?? "https://www.nodosol.com",
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
    from: Deno.env.get("EMAIL_FROM_ADDRESS") ?? "",
  });
  if (!sent) {
    // Roll the token back so the user can retry without waiting for rate limit.
    await admin
      .from("notification_preferences")
      .update({ email_verification_token: null, email_verification_sent_at: null })
      .eq("wallet_pubkey", wallet);
    return jsonResp(
      { error: "Email send failed — check function logs and try again." },
      502,
    );
  }
  return jsonResp({ ok: true });
}

async function handleConfirm(
  req: Request,
  sbUrl: string,
  sbKey: string,
): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token.length !== TOKEN_BYTES * 2 || !/^[0-9a-f]+$/i.test(token)) {
    return jsonResp({ error: "Bad or missing token" }, 400);
  }

  const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  const { data: row } = await admin
    .from("notification_preferences")
    .select("wallet_pubkey, email, email_verification_sent_at, email_verified_at")
    .eq("email_verification_token", token)
    .maybeSingle();

  if (!row) {
    return jsonResp({ error: "Token unknown or already used" }, 404);
  }

  const sentAt = row.email_verification_sent_at
    ? new Date(row.email_verification_sent_at).getTime()
    : 0;
  if (!sentAt || Date.now() - sentAt > VERIFY_TTL_MS) {
    // Burn the stale token so it can't be retried.
    await admin
      .from("notification_preferences")
      .update({ email_verification_token: null, email_verification_sent_at: null })
      .eq("wallet_pubkey", row.wallet_pubkey);
    await logSecurityEvent(sbUrl, sbKey, req, {
      type: "challenge_expired",
      severity: "warn",
      wallet: row.wallet_pubkey,
      details: { endpoint: "verify-email/confirm", reason: "ttl" },
    });
    return jsonResp({ error: "Token expired — request a fresh email" }, 410);
  }

  const { error: updateErr } = await admin
    .from("notification_preferences")
    .update({
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
      email_verification_sent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("wallet_pubkey", row.wallet_pubkey);
  if (updateErr) {
    console.error("verify update failed", updateErr);
    return jsonResp({ error: "Server error" }, 500);
  }
  await logSecurityEvent(sbUrl, sbKey, req, {
    type: "email_verified",
    severity: "info",
    wallet: row.wallet_pubkey,
    details: { email: row.email },
  });
  return jsonResp({ ok: true, wallet: row.wallet_pubkey, email: row.email });
}

async function sendVerifyEmail(opts: {
  to: string;
  wallet: string;
  token: string;
  appUrl: string;
  apiKey: string;
  from: string;
}): Promise<boolean> {
  if (!opts.apiKey || !opts.from) {
    console.error("Resend env missing — RESEND_API_KEY or EMAIL_FROM_ADDRESS");
    return false;
  }
  const link = `${opts.appUrl}/verify?token=${opts.token}`;
  const shortWallet = `${opts.wallet.slice(0, 4)}…${opts.wallet.slice(-4)}`;
  const subject = "Confirm your Nodosol email";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#eef0f3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d12;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#11141a;border:1px solid #1f242d;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #1f242d;font-size:14px;color:#7c8694;letter-spacing:0.04em;text-transform:uppercase;">Nodosol</td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#eef0f3;">Confirm your email</h1>
          <p style="margin:0 0 18px 0;font-size:15px;line-height:1.55;color:#c5cbd4;">Wallet <code style="color:#eef0f3">${escapeHtml(shortWallet)}</code> asked Nodosol to send notifications to this address. Click below within 24 hours to confirm.</p>
          <a href="${escapeAttr(link)}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">Confirm email</a>
          <p style="margin:18px 0 0 0;font-size:12px;color:#7c8694;">If you didn't ask for this, ignore the email — the token expires automatically.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `Confirm your Nodosol email for wallet ${shortWallet}.\n\nOpen: ${link}\n\nThis link expires in 24 hours. If you didn't request it, ignore this email.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        subject,
        html,
        text,
      }),
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

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

function jsonResp(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
