"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reported, setReported] = useState<"idle" | "sending" | "ok" | "err">("idle");

  useEffect(() => {
    console.error("GlobalError", error);
  }, [error]);

  async function report() {
    if (reported !== "idle") return;
    setReported("sending");
    try {
      const route = typeof window !== "undefined" ? window.location.pathname : null;
      const res = await fetch("/api/log-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          route,
        }),
      });
      setReported(res.ok ? "ok" : "err");
    } catch {
      setReported("err");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={brandStyle}>
          <span style={logoMarkStyle}>n</span>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>nodosol</span>
        </div>

        <h1 style={{ fontSize: "1.8rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: "0.6rem" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: "1.5rem" }}>
          An unexpected error crashed this page. This is usually a transient
          issue with the Solana RPC or an on-chain account that changed between
          fetch and render. Try again — if it keeps happening, go back home.
        </p>

        {error.digest ? (
          <div
            style={{
              fontSize: "0.78rem",
              color: "#71717a",
              background: "#15171c",
              border: "1px solid #23262d",
              borderRadius: 6,
              padding: "0.5rem 0.75rem",
              marginBottom: "1.25rem",
              fontFamily: "'SF Mono', Menlo, monospace",
              wordBreak: "break-all",
            }}
          >
            Reference: {error.digest}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button onClick={() => reset()} style={primaryBtn}>
            Retry
          </button>
          <Link href="/" style={secondaryBtn}>
            Home
          </Link>
          <button
            onClick={() => void report()}
            disabled={reported !== "idle"}
            style={{
              ...secondaryBtn,
              opacity: reported === "sending" ? 0.6 : 1,
              cursor: reported === "idle" ? "pointer" : "default",
            }}
          >
            {reported === "idle"
              ? "Report"
              : reported === "sending"
                ? "Reporting…"
                : reported === "ok"
                  ? "Reported ✓"
                  : "Report failed"}
          </button>
        </div>
      </div>
    </main>
  );
}

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  marginBottom: "2rem",
};

const logoMarkStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  color: "#fff",
  border: "none",
  padding: "0.7rem 1.4rem",
  borderRadius: 8,
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: "#e8e8e8",
  border: "1px solid #2a2e36",
  padding: "0.7rem 1.4rem",
  borderRadius: 8,
  fontSize: "0.9rem",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};
