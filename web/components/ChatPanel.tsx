"use client";

import bs58 from "bs58";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";

import {
  ChatMessage,
  getSupabaseAnonKey,
  getSupabaseClient,
  getSupabaseUrl,
} from "@/lib/supabase";

type Props = {
  memoHash: string;
  sellerPubkey: string;
  buyerPubkey: string;
  dealAddress: string;
  viewerPubkey: string;
  onClose: () => void;
};

type SessionSig = {
  message: string;
  signatureBase58: string;
  signedAt: number; // ms
};

// Re-use a signed challenge for up to 14 minutes (function enforces 15 min TTL).
const SIG_TTL_MS = 14 * 60 * 1000;

export function ChatPanel({
  memoHash,
  sellerPubkey,
  buyerPubkey,
  dealAddress,
  viewerPubkey,
  onClose,
}: Props) {
  const { signMessage } = useWallet();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionSigRef = useRef<SessionSig | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function init() {
      // Best-effort client-side thread upsert: if migration 012 has been
      // applied, RLS blocks this and we rely on post-chat-message to create
      // the thread server-side from threadContext. Either way the chat UX
      // works — we never want a missing thread row to break the panel.
      const { error: upsertErr } = await supabase
        .from("chat_threads")
        .upsert(
          {
            memo_hash: memoHash,
            seller_pubkey: sellerPubkey,
            buyer_pubkey: buyerPubkey,
            deal_address: dealAddress,
          },
          { onConflict: "memo_hash", ignoreDuplicates: true }
        );
      if (upsertErr) {
        // RLS rejection after migration 012 is expected and harmless.
        console.debug("client-side thread upsert skipped:", upsertErr.message);
      }

      const { data, error: fetchErr } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_memo_hash", memoHash)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (fetchErr) {
        setError(fetchErr.message);
        setMessages([]);
        return;
      }
      setMessages(data as ChatMessage[]);

      const channel = supabase
        .channel(`chat:${memoHash}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `thread_memo_hash=eq.${memoHash}`,
          },
          (payload) => {
            setMessages((prev) => {
              const incoming = payload.new as ChatMessage;
              if (prev?.some((m) => m.id === incoming.id)) return prev;
              return [...(prev ?? []), incoming];
            });
          }
        )
        .subscribe();
      channelRef.current = channel;
    }

    void init();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void getSupabaseClient().removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [memoHash, sellerPubkey, buyerPubkey, dealAddress]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isAllowedToWrite =
    viewerPubkey === sellerPubkey || viewerPubkey === buyerPubkey;
  const canSign = Boolean(signMessage);

  async function ensureSessionSig(): Promise<SessionSig> {
    const current = sessionSigRef.current;
    if (current && Date.now() - current.signedAt < SIG_TTL_MS) {
      return current;
    }
    if (!signMessage) {
      throw new Error("Your wallet does not support message signing.");
    }
    setSigning(true);
    try {
      const timestamp = Date.now();
      const message = `nodosol-chat:v1:${memoHash}:${viewerPubkey}:${timestamp}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const fresh: SessionSig = {
        message,
        signatureBase58: bs58.encode(sigBytes),
        signedAt: timestamp,
      };
      sessionSigRef.current = fresh;
      return fresh;
    } finally {
      setSigning(false);
    }
  }

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!isAllowedToWrite) {
      setError("Only the deal's seller or buyer can post.");
      return;
    }
    if (!canSign) {
      setError("Your wallet does not support message signing.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const sig = await ensureSessionSig();
      const resp = await fetch(`${getSupabaseUrl()}/functions/v1/post-chat-message`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: getSupabaseAnonKey(),
          authorization: `Bearer ${getSupabaseAnonKey()}`,
        },
        body: JSON.stringify({
          threadMemoHash: memoHash,
          body: trimmed,
          senderPubkey: viewerPubkey,
          message: sig.message,
          signature: sig.signatureBase58,
          threadContext: {
            sellerPubkey,
            buyerPubkey,
            dealAddress,
          },
        }),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        // If the cached signature was rejected (expired), clear it so the next
        // attempt re-signs.
        if (resp.status === 401) sessionSigRef.current = null;
        throw new Error(payload?.error ?? `HTTP ${resp.status}`);
      }
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "94vw",
          background: "#ffffff",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 30px rgba(0,0,0,0.2)",
        }}
      >
        <header
          style={{
            padding: "1rem 1.2rem",
            borderBottom: "1px solid #eef0f3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 500 }}>Deal thread</div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "#111827",
                fontFamily: "'SF Mono', Menlo, monospace",
                marginTop: "0.15rem",
              }}
            >
              {memoHash.slice(0, 12)}…
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#6b7280",
              fontSize: "1.35rem",
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.65rem",
            background: "#fafbfc",
          }}
        >
          {messages === null ? (
            <div style={{ color: "#9ca3af", fontSize: "0.85rem", textAlign: "center", marginTop: "2rem" }}>
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: "0.85rem", textAlign: "center", marginTop: "2rem" }}>
              No messages yet. Start the conversation with your counterparty.
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_pubkey === viewerPubkey;
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    background: isMine ? "#4f46e5" : "#ffffff",
                    color: isMine ? "#ffffff" : "#111827",
                    border: isMine ? "none" : "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "0.55rem 0.8rem",
                    fontSize: "0.88rem",
                    lineHeight: 1.4,
                    boxShadow: isMine ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                    wordBreak: "break-word",
                  }}
                >
                  <div style={{ fontSize: "0.68rem", opacity: 0.7, marginBottom: "0.18rem", fontWeight: 600 }}>
                    {isMine ? "You" : shorten(m.sender_pubkey)}
                  </div>
                  {m.body}
                  <div style={{ fontSize: "0.65rem", opacity: 0.55, marginTop: "0.25rem", textAlign: "right" }}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error ? (
          <div style={{ padding: "0.6rem 1.2rem", fontSize: "0.78rem", color: "#b91c1c", background: "#fee2e2" }}>
            {error}
          </div>
        ) : null}

        <footer
          style={{
            padding: "0.85rem 1.2rem",
            borderTop: "1px solid #eef0f3",
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-end",
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              !isAllowedToWrite
                ? "Only the deal's seller or buyer can post"
                : !canSign
                  ? "Wallet does not support signMessage"
                  : signing
                    ? "Waiting for wallet signature…"
                    : "Message…"
            }
            disabled={!isAllowedToWrite || !canSign || sending || signing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (isAllowedToWrite && canSign) void send();
              }
            }}
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 140,
              resize: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "0.55rem 0.8rem",
              fontSize: "0.88rem",
              fontFamily: "inherit",
              outline: "none",
              color: "#111827",
              background: "#ffffff",
            }}
          />
          <button
            onClick={() => void send()}
            disabled={!isAllowedToWrite || !canSign || sending || signing || !body.trim()}
            style={{
              background: !body.trim() || !isAllowedToWrite || !canSign ? "#e5e7eb" : "#4f46e5",
              color: !body.trim() || !isAllowedToWrite || !canSign ? "#9ca3af" : "#ffffff",
              border: "none",
              borderRadius: 10,
              padding: "0.55rem 1rem",
              fontSize: "0.86rem",
              fontWeight: 600,
              cursor: !body.trim() || !isAllowedToWrite || !canSign ? "not-allowed" : "pointer",
            }}
          >
            {sending || signing ? "…" : "Send"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
