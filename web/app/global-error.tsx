"use client";

import { useEffect } from "react";

// Next 15 root-layout error boundary. Renders its own <html>+<body>
// because the layout itself failed and there's nothing wrapping us.
// Keep this template-string-styled so it works even if globals.css
// or React context providers are the source of the crash.

export default function GlobalLayoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("GlobalLayoutError", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0b0d12",
          color: "#eef0f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div
            style={{
              fontSize: "0.78rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#7c8694",
              marginBottom: "1.5rem",
            }}
          >
            nodosol
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            App failed to render
          </h1>
          <p
            style={{
              color: "#c5cbd4",
              fontSize: "0.95rem",
              lineHeight: 1.55,
              marginBottom: "1.5rem",
            }}
          >
            The root layout itself crashed. Reloading often fixes it; if not,
            we&apos;ve already logged the digest server-side.
          </p>
          {error.digest ? (
            <div
              style={{
                fontSize: "0.78rem",
                color: "#7c8694",
                background: "#11141a",
                border: "1px solid #1f242d",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                marginBottom: "1.25rem",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                wordBreak: "break-all",
              }}
            >
              Reference: {error.digest}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#7b9cff",
              color: "#0a0a0a",
              border: "none",
              padding: "0.7rem 1.4rem",
              borderRadius: 8,
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      </body>
    </html>
  );
}
