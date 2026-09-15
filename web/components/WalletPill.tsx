"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

export function WalletPill() {
  const { publicKey, connected } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        style={{
          height: 40,
          width: 160,
          background: "#f7f8fa",
          border: "1px solid #eef0f3",
          borderRadius: 999,
        }}
      />
    );
  }

  if (!connected || !publicKey) {
    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        <WalletMultiButton
          style={{
            background: "#4f46e5",
            height: 40,
            borderRadius: 8,
            fontSize: "0.85rem",
            fontWeight: 600,
            padding: "0 1rem",
            color: "#fff",
            lineHeight: "40px",
          }}
        />
      </div>
    );
  }

  const addr = publicKey.toBase58();
  const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  const initials = addr.slice(0, 2).toUpperCase();

  return (
    <WalletMultiButton
      style={{
        height: 40,
        background: "#f7f8fa",
        border: "1px solid #eef0f3",
        borderRadius: 999,
        padding: "0 0.85rem 0 0.35rem",
        color: "#111827",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        fontSize: "0.82rem",
        fontWeight: 600,
        lineHeight: 1,
      }}
      startIcon={
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.72rem",
            fontWeight: 600,
          }}
        >
          {initials}
        </span>
      }
    >
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, textAlign: "left" }}>
        <span style={{ fontWeight: 600 }}>{short}</span>
        <span style={{ color: "#6b7280", fontSize: "0.7rem", fontWeight: 400 }}>Connected</span>
      </span>
    </WalletMultiButton>
  );
}
