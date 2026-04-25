"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CreatorProfileRow,
  CreatorProfileWritable,
  fetchProfileByWallet,
  isHandleAvailable,
  isValidHandle,
  upsertProfile,
} from "@/lib/creatorProfile";
import {
  getCachedChatJwt,
  setCachedChatJwt,
} from "@/lib/chatSession";
import { requestChatJwt } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";

const JWT_REFRESH_SLACK_S = 60;

type Form = {
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  banner_url: string;
  twitter: string;
  website: string;
  discord: string;
  telegram: string;
};

const EMPTY_FORM: Form = {
  handle: "",
  display_name: "",
  bio: "",
  avatar_url: "",
  banner_url: "",
  twitter: "",
  website: "",
  discord: "",
  telegram: "",
};

export function EditProfileView() {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<CreatorProfileRow | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [handleStatus, setHandleStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const row = await fetchProfileByWallet(wallet);
      setExisting(row);
      if (row) {
        setForm({
          handle: row.handle,
          display_name: row.display_name ?? "",
          bio: row.bio ?? "",
          avatar_url: row.avatar_url ?? "",
          banner_url: row.banner_url ?? "",
          twitter: row.twitter ?? "",
          website: row.website ?? "",
          discord: row.discord ?? "",
          telegram: row.telegram ?? "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // Live handle-availability check (debounced).
  useEffect(() => {
    if (!form.handle) {
      setHandleStatus("idle");
      return;
    }
    if (!isValidHandle(form.handle.toLowerCase())) {
      setHandleStatus("invalid");
      return;
    }
    if (existing && existing.handle === form.handle.toLowerCase()) {
      setHandleStatus("available");
      return;
    }
    let cancelled = false;
    setHandleStatus("checking");
    const t = setTimeout(async () => {
      const ok = await isHandleAvailable(form.handle);
      if (!cancelled) setHandleStatus(ok ? "available" : "taken");
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.handle, existing]);

  async function ensureJwt(): Promise<string> {
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
  }

  async function save() {
    if (!wallet) return;
    if (!isValidHandle(form.handle.toLowerCase())) {
      toast.error("Pick a valid handle: 2–31 chars, lowercase letters/digits/-/_");
      return;
    }
    if (handleStatus === "taken") {
      toast.error("Handle is already taken");
      return;
    }

    setBusy(true);
    try {
      const jwt = await ensureJwt();
      const patch: CreatorProfileWritable = {
        handle: form.handle.toLowerCase(),
        display_name: form.display_name.trim() || null,
        bio: form.bio.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        banner_url: form.banner_url.trim() || null,
        twitter: form.twitter.trim() || null,
        website: form.website.trim() || null,
        discord: form.discord.trim() || null,
        telegram: form.telegram.trim() || null,
      };
      const result = await upsertProfile(wallet, jwt, patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setExisting(result.row);
      toast.success(existing ? "Profile updated" : "Profile claimed");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <div style={{ padding: "2rem 0" }}>
        <h1 style={{ fontSize: "1.55rem", fontWeight: 600, marginBottom: "0.4rem" }}>
          Public profile
        </h1>
        <p style={{ color: "var(--shell-muted)", marginBottom: "1.25rem" }}>
          Connect a wallet to claim your shareable handle.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.55rem", fontWeight: 600, marginBottom: "0.3rem" }}>
          Public profile
        </h1>
        <p style={{ color: "var(--shell-muted)", fontSize: "0.9rem", maxWidth: 640 }}>
          Claim a handle and your profile appears at{" "}
          <code style={{ background: "var(--shell-card-alt)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>
            nodosol.com/c/{form.handle || "your-handle"}
          </code>
          . Bio + links + tip jar + subscription plans render automatically.
        </p>
      </header>

      {loading ? (
        <div style={{ padding: "1.5rem 0", color: "var(--shell-muted)" }}>Loading…</div>
      ) : (
        <>
          {existing ? (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.85rem 1.05rem",
                background: "var(--shell-card-alt)",
                border: "1px solid var(--shell-border)",
                borderRadius: 10,
                fontSize: "0.88rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <span>
                Live at{" "}
                <Link href={`/c/${existing.handle}`} target="_blank" style={{ color: "var(--shell-link)", fontWeight: 600 }}>
                  /c/{existing.handle}
                </Link>
              </span>
              <Link href={`/c/${existing.handle}`} target="_blank" style={{ fontSize: "0.82rem", color: "var(--shell-muted)" }}>
                Open ↗
              </Link>
            </div>
          ) : null}

          <div style={cardStyle}>
            <Field
              label="Handle"
              hint={handleHint(handleStatus)}
              hintColor={handleColor(handleStatus)}
            >
              <input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
                placeholder="djblendi"
                maxLength={31}
                style={inputStyle}
              />
            </Field>

            <Field label="Display name" hint="Shown as the profile heading. Defaults to handle if empty.">
              <input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="DJ Blendi"
                maxLength={64}
                style={inputStyle}
              />
            </Field>

            <Field label="Bio" hint="Up to 280 chars. Markdown not rendered.">
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Belgrade-based DJ. Resident at Drugstore. EXIT 2026 main stage."
                maxLength={280}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <Field label="Avatar URL" hint="Square image, ≥256px. Use Imgur/Cloudinary/your CDN.">
              <input
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://…/avatar.png"
                maxLength={512}
                style={inputStyle}
              />
            </Field>

            <Field label="Banner URL" hint="Wide image (≥1200×300) shown at the top of your profile.">
              <input
                value={form.banner_url}
                onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
                placeholder="https://…/banner.jpg"
                maxLength={512}
                style={inputStyle}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
              <Field label="Twitter / X handle">
                <input
                  value={form.twitter}
                  onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                  placeholder="djblendi"
                  maxLength={32}
                  style={inputStyle}
                />
              </Field>
              <Field label="Website">
                <input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://djblendi.com"
                  maxLength={256}
                  style={inputStyle}
                />
              </Field>
              <Field label="Discord (invite or @user)">
                <input
                  value={form.discord}
                  onChange={(e) => setForm({ ...form, discord: e.target.value })}
                  placeholder="https://discord.gg/…"
                  maxLength={256}
                  style={inputStyle}
                />
              </Field>
              <Field label="Telegram (invite or @user)">
                <input
                  value={form.telegram}
                  onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  placeholder="https://t.me/…"
                  maxLength={256}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.6rem" }}>
            <button
              onClick={() => void save()}
              disabled={busy || handleStatus === "taken" || handleStatus === "invalid" || !form.handle}
              style={{
                background: "#4f46e5",
                color: "#fff",
                padding: "0.6rem 1.3rem",
                borderRadius: 8,
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
                opacity: busy || handleStatus === "taken" || handleStatus === "invalid" || !form.handle ? 0.5 : 1,
              }}
            >
              {busy ? "Saving…" : existing ? "Save changes" : "Claim handle"}
            </button>
            {existing ? (
              <Link
                href={`/c/${existing.handle}`}
                target="_blank"
                style={{
                  padding: "0.6rem 1.3rem",
                  borderRadius: 8,
                  border: "1px solid var(--shell-border-strong)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  color: "var(--shell-fg)",
                  textDecoration: "none",
                }}
              >
                Preview ↗
              </Link>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function handleHint(status: ReturnType<typeof useState<string>>[0]): string {
  switch (status) {
    case "checking":
      return "Checking…";
    case "available":
      return "Available ✓";
    case "taken":
      return "Already taken";
    case "invalid":
      return "2–31 chars: lowercase letters, digits, hyphen, underscore. Some words reserved.";
    default:
      return "2–31 chars, lowercase. Letters/digits/hyphen/underscore.";
  }
}

function handleColor(status: ReturnType<typeof useState<string>>[0]): string {
  switch (status) {
    case "available":
      return "#059669";
    case "taken":
    case "invalid":
      return "#dc2626";
    default:
      return "var(--shell-muted)";
  }
}

function Field({
  label,
  hint,
  hintColor,
  children,
}: {
  label: string;
  hint?: string;
  hintColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.3rem" }}>
        {label}
      </label>
      {children}
      {hint ? (
        <div style={{ fontSize: "0.75rem", color: hintColor ?? "var(--shell-muted)", marginTop: "0.3rem" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1.25rem 1.4rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  borderRadius: 7,
  border: "1px solid var(--shell-border-strong)",
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  fontSize: "0.9rem",
  outline: "none",
};
