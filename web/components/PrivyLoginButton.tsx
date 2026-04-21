"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

export function PrivyLoginButton() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!appId || !mounted) return null;
  return <PrivyLoginButtonInner />;
}

function PrivyLoginButtonInner() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();

  if (!ready) {
    return (
      <div
        style={{
          height: 40,
          width: 150,
          background: "var(--shell-pill-bg, #f7f8fa)",
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 999,
        }}
      />
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={login}
        style={{
          height: 40,
          padding: "0 1rem",
          borderRadius: 999,
          border: "1px solid var(--shell-border, #eef0f3)",
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        <span>✉️</span>
        <span>Sign in with email</span>
      </button>
    );
  }

  const addr = wallets[0]?.address;
  const short = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : user?.email?.address ?? "Signed in";

  return (
    <button
      type="button"
      onClick={logout}
      title="Privy session — click to sign out"
      style={{
        height: 40,
        padding: "0 0.85rem",
        borderRadius: 999,
        border: "1px solid var(--shell-border, #eef0f3)",
        background: "var(--shell-pill-bg, #f7f8fa)",
        color: "var(--shell-fg, #111827)",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#10b981",
        }}
      />
      <span>{short}</span>
    </button>
  );
}
