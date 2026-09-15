import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

/**
 * Signed check-in payload — the attendee signs this JSON string with
 * their wallet, and door staff pastes the resulting compact code so
 * we can verify ownership before admitting the ticket.
 *
 * The message is deterministically derived from (asset, event, ts)
 * so a replay attempt is always either stale (ts too old) or targets
 * a different event.
 */
export const CHECK_IN_CODE_PREFIX = "nodosol-checkin";
export const CHECK_IN_CODE_VERSION = 1;
export const CHECK_IN_MAX_AGE_MS = 5 * 60 * 1000;

export type CheckInPayload = {
  version: number;
  asset: string;
  event: string;
  ts: number;
  signer: string;
};

export type SignedCheckIn = CheckInPayload & {
  /** base58-encoded ed25519 signature of buildCheckInMessage(payload) */
  sig: string;
};

/** Deterministic UTF-8 message the attendee signs. */
export function buildCheckInMessage(payload: CheckInPayload): string {
  return JSON.stringify({
    v: payload.version,
    asset: payload.asset,
    event: payload.event,
    ts: payload.ts,
    signer: payload.signer,
  });
}

/**
 * Encode the signed check-in as a single-line paste-friendly code:
 *   nodosol-checkin|1|<asset>|<event>|<ts>|<signer>|<sig>
 */
export function formatCheckInCode(signed: SignedCheckIn): string {
  return [
    CHECK_IN_CODE_PREFIX,
    signed.version.toString(),
    signed.asset,
    signed.event,
    signed.ts.toString(),
    signed.signer,
    signed.sig,
  ].join("|");
}

export function parseCheckInCode(raw: string): SignedCheckIn | null {
  const s = raw.trim();
  if (!s.startsWith(`${CHECK_IN_CODE_PREFIX}|`)) return null;
  const parts = s.split("|");
  if (parts.length !== 7) return null;
  const [, versionStr, asset, event, tsStr, signer, sig] = parts;
  const version = parseInt(versionStr, 10);
  const ts = parseInt(tsStr, 10);
  if (!Number.isInteger(version) || !Number.isInteger(ts)) return null;
  return { version, asset, event, ts, signer, sig };
}

/**
 * Verify the signature against the derived message. Does NOT check
 * ownership — caller must cross-reference signer with the current
 * on-chain holder (via Helius DAS) before trusting the admit.
 */
export function verifyCheckInSignature(signed: SignedCheckIn): {
  ok: boolean;
  reason?: string;
} {
  if (signed.version !== CHECK_IN_CODE_VERSION) {
    return { ok: false, reason: `Unsupported version ${signed.version}` };
  }
  const age = Date.now() - signed.ts;
  if (age < 0) return { ok: false, reason: "Code timestamp is in the future." };
  if (age > CHECK_IN_MAX_AGE_MS) {
    return {
      ok: false,
      reason: `Code is ${Math.round(age / 1000)}s old — ask attendee to regenerate.`,
    };
  }
  let signerBytes: Uint8Array;
  try {
    signerBytes = new PublicKey(signed.signer).toBytes();
  } catch {
    return { ok: false, reason: "Invalid signer pubkey." };
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signed.sig);
  } catch {
    return { ok: false, reason: "Signature is not valid base58." };
  }
  if (sigBytes.length !== 64) {
    return { ok: false, reason: `Signature length ${sigBytes.length} (expected 64).` };
  }
  const message = new TextEncoder().encode(buildCheckInMessage(signed));
  const ok = nacl.sign.detached.verify(message, sigBytes, signerBytes);
  return ok ? { ok: true } : { ok: false, reason: "Signature does not match signer." };
}
