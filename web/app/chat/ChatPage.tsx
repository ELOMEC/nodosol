"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { ChatPanel } from "@/components/ChatPanel";
import { deriveGroupMemoHash } from "@/lib/supabase";

type Channel = {
  slug: string;
  label: string;
  description: string;
};

// Keep in sync with the seed inserts in supabase/014_chat_multitype.sql.
// Adding a channel here without a matching seed row will fail on first
// post (post-chat-message refuses unknown group slugs).
const CHANNELS: Channel[] = [
  { slug: "general", label: "# general", description: "Community-wide chat, intros, and open questions." },
  { slug: "tickets", label: "# tickets", description: "Event organisers, door scans, seated ticketing Q&A." },
  { slug: "rentals", label: "# rentals", description: "Landlords and tenants — on-chain rent, house rules, lease advice." },
  { slug: "auctions", label: "# auctions", description: "Sealed-bid auction discussion and upcoming drops." },
  { slug: "rwa", label: "# rwa", description: "Real-world asset tokenisation, compliance, jurisdictions." },
  { slug: "showcase", label: "# showcase", description: "Show what you've sold, bought, or built on Nodosol." },
  { slug: "deals", label: "# deals", description: "OTC signals, deal invites, deal talk (not financial advice)." },
];

export function ChatPage() {
  const { publicKey, connected } = useWallet();
  const [slug, setSlug] = useState<string>(CHANNELS[0].slug);
  const [memoHash, setMemoHash] = useState<string | null>(null);

  // Default to ?c= slug if present and valid.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c && CHANNELS.some((ch) => ch.slug === c)) setSlug(c);
  }, []);

  // Recompute group hash when slug changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const h = await deriveGroupMemoHash(slug);
      if (!cancelled) setMemoHash(h);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Reflect current channel in the URL so links are shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("c", slug);
    window.history.replaceState(null, "", url.toString());
  }, [slug]);

  const viewerPubkey = publicKey?.toBase58() ?? null;
  const current = useMemo(() => CHANNELS.find((c) => c.slug === slug)!, [slug]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        gap: "1rem",
        height: "calc(100dvh - 140px)",
        minHeight: 500,
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--shell-border, #eef0f3)",
          paddingRight: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.2rem",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "#6b7280",
            letterSpacing: 0.6,
            padding: "0.4rem 0.55rem",
            textTransform: "uppercase",
          }}
        >
          Channels
        </div>
        {CHANNELS.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setSlug(c.slug)}
            style={{
              textAlign: "left",
              padding: "0.5rem 0.65rem",
              border: "none",
              borderRadius: 6,
              background: c.slug === slug ? "#eef2ff" : "transparent",
              color: c.slug === slug ? "#3730a3" : "var(--shell-fg, #111827)",
              fontSize: "0.9rem",
              fontWeight: c.slug === slug ? 600 : 500,
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
        <div
          style={{
            fontSize: "0.72rem",
            color: "#6b7280",
            marginTop: "1rem",
            padding: "0.4rem 0.55rem",
            lineHeight: 1.45,
          }}
        >
          Public channels. Anyone with a connected wallet can post.
          Rate-limited to 30 messages / 5 min per wallet. Be kind.
        </div>
      </aside>

      <section
        style={{
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: "0.65rem 1rem",
            borderBottom: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-card, #fff)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{current.label}</div>
          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.15rem" }}>
            {current.description}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, background: "#fafbfc" }}>
          {connected && viewerPubkey && memoHash ? (
            <ChatPanel
              thread={{ kind: "group", memoHash, channelSlug: slug }}
              viewerPubkey={viewerPubkey}
              onClose={() => {}}
              embedded
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "2rem",
              }}
            >
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>Connect a wallet to join the channel</div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280", maxWidth: 380 }}>
                Group chat uses wallet signatures for anti-spam. Channels are
                visible to anyone connected, and each message is signed by
                your wallet — no accounts, no passwords.
              </div>
              <WalletMultiButton />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
