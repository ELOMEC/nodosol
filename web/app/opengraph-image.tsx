import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Nodosol — Solana super-app for compliant RWA + creator payments";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0a 0%, #111118 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ececef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            n
          </div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>
            nodosol
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              maxWidth: 960,
              display: "flex",
            }}
          >
            Compliant RWA + creator payments on Solana
          </div>
          <div style={{ fontSize: 26, color: "#a1a1aa", maxWidth: 880, display: "flex" }}>
            Tokenize real-world assets. Sell tickets. Rent out property. One Solana app, licenced.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 24, fontSize: 20, color: "#71717a" }}>
            <span style={{ display: "flex" }}>Token-2022</span>
            <span style={{ display: "flex" }}>•</span>
            <span style={{ display: "flex" }}>Squads multisig</span>
            <span style={{ display: "flex" }}>•</span>
            <span style={{ display: "flex" }}>Confidential-ready</span>
          </div>
          <div style={{ fontSize: 22, color: "#a5b4fc", fontWeight: 600, display: "flex" }}>
            nodosol.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
