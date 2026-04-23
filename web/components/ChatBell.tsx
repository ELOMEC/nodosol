"use client";

import Link from "next/link";

/**
 * Lightweight chat entry-point in the topbar. v1 links straight to /chat
 * (group channels). A dropdown with unread counts per personal thread is
 * v2 — it needs a chat-JWT to query chat_threads under RLS, which means
 * an extra wallet signature just to render the bell. We want the header
 * to stay cheap on every page load.
 */
export function ChatBell() {
  return (
    <Link
      href="/chat"
      aria-label="Open chat channels"
      title="Chat channels"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 8,
        border: "1px solid var(--shell-border)",
        background: "var(--shell-card)",
        color: "var(--shell-fg)",
        textDecoration: "none",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </Link>
  );
}
