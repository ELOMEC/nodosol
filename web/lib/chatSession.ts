/**
 * localStorage-backed cache for chat wallet signatures.
 *
 * Two things we cache:
 *
 *   1. Chat read JWT — single token per wallet, minted by the
 *      issue-chat-jwt Edge Function after the user signs a
 *      `nodosol-chat-auth` challenge. Used for RLS-gated SELECTs and
 *      realtime subscribes. Typical TTL ~1 h.
 *
 *   2. Per-thread send signature — one wallet signature per thread,
 *      used to authenticate writes to post-chat-message. TTL 14 min
 *      (< 15 min the Edge Function enforces).
 *
 * Before this, both lived in `useRef` inside ChatPanel and evaporated
 * every time the component unmounted (page nav, bell toggle, etc.).
 * That meant a single user session triggered 3–5 wallet popups. Now
 * the cache survives unmount, reload, and new tabs, so a connected
 * wallet typically signs once per hour total.
 *
 * Keys are namespaced under `nodosol:chat:*:<wallet>` so swapping to a
 * different wallet automatically misses the cache and forces a fresh
 * signature — never reuse an old wallet's JWT after a reconnect.
 */

const PER_THREAD_TTL_MS = 14 * 60 * 1000;
const JWT_REFRESH_SLACK_S = 60;

function jwtKey(wallet: string): string {
  return `nodosol:chat:jwt:${wallet}`;
}

function sigKey(wallet: string, memoHash: string): string {
  return `nodosol:chat:sig:${wallet}:${memoHash}`;
}

export type CachedJwt = {
  jwt: string;
  /** Unix seconds. */
  expiresAt: number;
};

export type CachedThreadSig = {
  message: string;
  signatureBase58: string;
  /** Millis since epoch. */
  signedAt: number;
};

// ---------------------------------------------------------------------------
// JWT (chat reads)
// ---------------------------------------------------------------------------

export function getCachedChatJwt(wallet: string): CachedJwt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(jwtKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedJwt;
    const now = Math.floor(Date.now() / 1000);
    // Treat as missing once within the refresh slack so callers re-sign
    // before the token actually expires mid-request.
    if (!parsed?.jwt || parsed.expiresAt - now <= JWT_REFRESH_SLACK_S) {
      window.localStorage.removeItem(jwtKey(wallet));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedChatJwt(wallet: string, jwt: CachedJwt): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(jwtKey(wallet), JSON.stringify(jwt));
  } catch {
    // quota / private mode — best-effort
  }
}

export function clearCachedChatJwt(wallet: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(jwtKey(wallet));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Per-thread send signatures (chat writes)
// ---------------------------------------------------------------------------

export function getCachedThreadSig(
  wallet: string,
  memoHash: string,
): CachedThreadSig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sigKey(wallet, memoHash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedThreadSig;
    if (!parsed?.signatureBase58) return null;
    if (Date.now() - parsed.signedAt >= PER_THREAD_TTL_MS) {
      window.localStorage.removeItem(sigKey(wallet, memoHash));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedThreadSig(
  wallet: string,
  memoHash: string,
  sig: CachedThreadSig,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(sigKey(wallet, memoHash), JSON.stringify(sig));
  } catch {
    // ignore
  }
}

export function clearCachedThreadSig(wallet: string, memoHash: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(sigKey(wallet, memoHash));
  } catch {
    // ignore
  }
}
