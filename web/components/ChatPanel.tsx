"use client";

import bs58 from "bs58";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ChatMessage,
  ChatThreadRef,
  createAuthedSupabaseClient,
  getSupabaseAnonKey,
  getSupabaseClient,
  getSupabaseUrl,
  requestChatJwt,
} from "@/lib/supabase";
import {
  clearCachedThreadSig,
  getCachedChatJwt,
  getCachedThreadSig,
  setCachedChatJwt,
  setCachedThreadSig,
} from "@/lib/chatSession";
import { turnstileConfigured, TurnstileWidget } from "./TurnstileWidget";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

type Props = {
  thread: ChatThreadRef;
  viewerPubkey: string;
  onClose: () => void;
  /** When true the panel fills its parent rather than being an overlay
   *  dialog. Used by the /chat page to embed channels in a sidebar
   *  layout; onClose is ignored in this mode. */
  embedded?: boolean;
};

type SessionSig = {
  message: string;
  signatureBase58: string;
  signedAt: number; // ms
};

type SessionJwt = {
  jwt: string;
  client: SupabaseClient;
  expiresAt: number; // unix seconds
};

// Re-use a signed challenge for up to 14 minutes (function enforces 15 min TTL).
const SIG_TTL_MS = 14 * 60 * 1000;
const JWT_REFRESH_SLACK_S = 60;

export function ChatPanel({ thread, viewerPubkey, onClose, embedded = false }: Props) {
  const { signMessage } = useWallet();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionSigRef = useRef<SessionSig | null>(null);
  const sessionJwtRef = useRef<SessionJwt | null>(null);
  // Cloudflare Turnstile state, only used for group threads. Stored in a
  // ref (not state) so callback-driven token updates don't re-render the
  // widget and cause a re-mount. `turnstileConfigured()` is the gate —
  // when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, widget renders nothing
  // and the server mirrors with skip-verify.
  const turnstileTokenRef = useRef<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  const memoHash = thread.memoHash;

  // Who is allowed to post in this thread? OTC + listing_dm are 2-party;
  // group channels are open to any authenticated wallet.
  const isAllowedToWrite = useMemo(() => {
    if (thread.kind === "group") return true;
    return (
      viewerPubkey === thread.sellerPubkey ||
      viewerPubkey === thread.buyerPubkey
    );
  }, [thread, viewerPubkey]);

  const header = useMemo(() => {
    if (thread.kind === "group") {
      return { label: "Channel", value: `#${thread.channelSlug}` };
    }
    if (thread.kind === "listing_dm") {
      return {
        label: thread.listingKind.charAt(0).toUpperCase() + thread.listingKind.slice(1),
        value: `${memoHash.slice(0, 12)}…`,
      };
    }
    return { label: "Deal thread", value: `${memoHash.slice(0, 12)}…` };
  }, [thread, memoHash]);

  const placeholderForClosed =
    thread.kind === "group"
      ? "Connect your wallet to post"
      : "Only the listing's seller or buyer can post";

  async function signAuthChallenge(): Promise<SessionSig> {
    if (!signMessage) {
      throw new Error("Your wallet does not support message signing.");
    }
    setSigning(true);
    try {
      const timestamp = Date.now();
      const message = `nodosol-chat-auth:v1:${viewerPubkey}:${timestamp}`;
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      return {
        message,
        signatureBase58: bs58.encode(sigBytes),
        signedAt: timestamp,
      };
    } finally {
      setSigning(false);
    }
  }

  async function ensureAuthedClient(): Promise<SupabaseClient> {
    const now = Math.floor(Date.now() / 1000);

    // 1. Hot in-memory client + JWT (no work to do).
    const cached = sessionJwtRef.current;
    if (cached && cached.expiresAt - now > JWT_REFRESH_SLACK_S) {
      return cached.client;
    }

    // 2. localStorage: the same wallet may have signed earlier in the
    //    session (other page, other tab). Rehydrate silently — the only
    //    cost is reconstructing the SupabaseClient.
    const persisted = getCachedChatJwt(viewerPubkey);
    if (persisted) {
      const client = createAuthedSupabaseClient(persisted.jwt);
      client.realtime.setAuth(persisted.jwt);
      sessionJwtRef.current = {
        jwt: persisted.jwt,
        client,
        expiresAt: persisted.expiresAt,
      };
      return client;
    }

    // 3. Cold path: ask the wallet to sign, mint JWT, persist for reuse.
    const sig = await signAuthChallenge();
    const { jwt, expiresAt } = await requestChatJwt({
      wallet: viewerPubkey,
      message: sig.message,
      signatureBase58: sig.signatureBase58,
    });
    const client = createAuthedSupabaseClient(jwt);
    client.realtime.setAuth(jwt);
    sessionJwtRef.current = { jwt, client, expiresAt };
    setCachedChatJwt(viewerPubkey, { jwt, expiresAt });
    return client;
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Best-effort client-side thread upsert for OTC (back-compat with
      // old flow). For listing_dm the Edge Function handles creation;
      // groups are seeded by migration 014.
      if (thread.kind === "otc_deal") {
        try {
          const anon = getSupabaseClient();
          const { error: upsertErr } = await anon.from("chat_threads").upsert(
            {
              memo_hash: memoHash,
              thread_type: "otc_deal",
              seller_pubkey: thread.sellerPubkey,
              buyer_pubkey: thread.buyerPubkey,
              deal_address: thread.dealAddress,
            },
            { onConflict: "memo_hash", ignoreDuplicates: true },
          );
          if (upsertErr) {
            console.debug("client-side thread upsert skipped:", upsertErr.message);
          }
        } catch (err) {
          console.debug("thread upsert attempt failed", err);
        }
      }

      // Reads always go through the authed JWT after migration 013.
      // Fall back to anon client if JWT issuance fails so the panel
      // still renders a meaningful error.
      let supabase: SupabaseClient;
      try {
        supabase = await ensureAuthedClient();
      } catch (err) {
        console.warn("chat JWT issuance failed, falling back to anon client", err);
        supabase = getSupabaseClient();
      }
      if (cancelled) return;

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
          },
        )
        .subscribe();
      channelRef.current = channel;
    }

    void init();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        const client = sessionJwtRef.current?.client ?? getSupabaseClient();
        void client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // Stringify thread so the effect keys off its structural identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoHash, viewerPubkey, thread.kind]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const canSign = Boolean(signMessage);

  async function ensureSessionSig(): Promise<SessionSig> {
    // 1. In-memory — instant if we signed this thread already this mount.
    const current = sessionSigRef.current;
    if (current && Date.now() - current.signedAt < SIG_TTL_MS) {
      return current;
    }

    // 2. localStorage — same thread, same wallet, still within the 14 min
    //    window. Survives page reloads and cross-tab navigation.
    const persisted = getCachedThreadSig(viewerPubkey, memoHash);
    if (persisted) {
      sessionSigRef.current = persisted;
      return persisted;
    }

    // 3. Cold path — ask the wallet to sign a fresh challenge.
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
      setCachedThreadSig(viewerPubkey, memoHash, fresh);
      return fresh;
    } finally {
      setSigning(false);
    }
  }

  function buildThreadContext() {
    if (thread.kind === "otc_deal") {
      return {
        sellerPubkey: thread.sellerPubkey,
        buyerPubkey: thread.buyerPubkey,
        dealAddress: thread.dealAddress,
      };
    }
    if (thread.kind === "listing_dm") {
      return {
        kind: thread.listingKind,
        listingPda: thread.listingPda,
        sellerPubkey: thread.sellerPubkey,
        buyerPubkey: thread.buyerPubkey,
      };
    }
    return { channelSlug: thread.channelSlug };
  }

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!isAllowedToWrite) {
      setError("You are not allowed to post in this thread.");
      return;
    }
    if (!canSign) {
      setError("Your wallet does not support message signing.");
      return;
    }
    // Group threads require a Turnstile token when CF is configured.
    // We check the ref before we go ask the wallet to sign — no point
    // burning a signature if the bot gate will reject.
    const needsTurnstile = thread.kind === "group" && turnstileConfigured();
    if (needsTurnstile && !turnstileTokenRef.current) {
      setError("Please wait for the bot-check to complete and try again.");
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
          threadType: thread.kind,
          threadMemoHash: memoHash,
          body: trimmed,
          senderPubkey: viewerPubkey,
          message: sig.message,
          signature: sig.signatureBase58,
          threadContext: buildThreadContext(),
          turnstileToken: needsTurnstile ? turnstileTokenRef.current : undefined,
        }),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          // Stored sig was rejected as stale — drop both caches so the
          // next attempt re-signs from scratch.
          sessionSigRef.current = null;
          clearCachedThreadSig(viewerPubkey, memoHash);
        }
        if (resp.status === 403) {
          // Likely Turnstile rejection — force a widget refresh so the
          // user gets a new token on retry.
          turnstileTokenRef.current = null;
          turnstileRef.current?.reset();
        }
        throw new Error(payload?.error ?? `HTTP ${resp.status}`);
      }
      setBody("");
      // Successful send: burn the Turnstile token (one-shot) and arm
      // a fresh widget for the next message.
      if (needsTurnstile) {
        turnstileTokenRef.current = null;
        turnstileRef.current?.reset();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const inner = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: embedded ? "100%" : 420,
        maxWidth: embedded ? undefined : "94vw",
        background: "#ffffff",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: embedded ? "none" : "-8px 0 30px rgba(0,0,0,0.2)",
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
            <div style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 500 }}>
              {header.label}
            </div>
            <div
              style={{
                fontSize: "0.82rem",
                color: "#111827",
                fontFamily: thread.kind === "group" ? "inherit" : "'SF Mono', Menlo, monospace",
                marginTop: "0.15rem",
              }}
            >
              {header.value}
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
              {thread.kind === "group"
                ? "No messages yet. Be the first to say hi."
                : "No messages yet. Start the conversation."}
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

        {thread.kind === "group" && turnstileConfigured() ? (
          <div style={{ padding: "0.4rem 1.2rem 0" }}>
            <TurnstileWidget
              ref={turnstileRef}
              onToken={(token) => {
                turnstileTokenRef.current = token;
              }}
            />
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
                ? placeholderForClosed
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
  );

  if (embedded) return inner;

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
      {inner}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
