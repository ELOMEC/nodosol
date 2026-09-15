// Convert the raw output of RpcConnection.simulateTransaction() into a
// human-readable one-liner for window.alert. Phantom hides everything
// behind "Unexpected error" when preflight fails, so surfacing the real
// program log saves a Solana-Explorer round-trip during testing.

type SimulationErr = unknown;

// SPL Token / Token-2022 program error codes. Token-2022 reuses the
// classic codes for 0..0x13 and adds its own above. Full list:
// https://github.com/solana-labs/solana-program-library/blob/master/token/program/src/error.rs
const SPL_TOKEN_ERRORS: Record<number, string> = {
  0x0: "Account not rent-exempt",
  0x1: "Insufficient USDC balance",
  0x2: "Invalid mint",
  0x3: "Mint mismatch",
  0x4: "Owner mismatch",
  0x5: "Fixed supply — cannot mint more",
  0x6: "Account already in use",
  0x9: "Account not initialized",
  0xa: "Native token not supported",
  0xb: "Non-native account has non-zero balance",
  0xc: "Invalid instruction",
  0xd: "Account in invalid state",
  0xe: "Arithmetic overflow",
  0x11: "Account frozen",
  0x12: "Mint decimals mismatch",
};

export function decodeSimulationError(err: SimulationErr, logs: string[]): string {
  // 1. AnchorError — "AnchorError ... Error Code: X. Error Number: N. Error Message: <human>"
  const anchorLine = logs.find((l) => l.includes("AnchorError"));
  if (anchorLine) {
    const msgMatch = anchorLine.match(/Error Message: (.+?)\.?$/);
    if (msgMatch) return `On-chain: ${msgMatch[1]}`;
    const codeMatch = anchorLine.match(/Error Code: (\w+)/);
    if (codeMatch) return `On-chain error: ${codeMatch[1]}`;
    return `On-chain: ${anchorLine.replace(/^Program log: /, "")}`;
  }

  // 2. SPL / Token program errors surface as custom program error codes.
  if (typeof err === "object" && err !== null) {
    const instructionErr = (err as { InstructionError?: [number, unknown] }).InstructionError;
    if (Array.isArray(instructionErr)) {
      const [, inner] = instructionErr;
      if (typeof inner === "string") return `Instruction failed: ${inner}`;
      if (typeof inner === "object" && inner !== null) {
        const custom = (inner as { Custom?: number }).Custom;
        if (typeof custom === "number") {
          // Determine which program raised the error by scanning logs
          // for the most recent "invoke [N]" entry.
          const tokenInvoked = logs.some(
            (l) =>
              l.includes("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") || // Token-2022
              l.includes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") // classic SPL Token
          );
          const named = SPL_TOKEN_ERRORS[custom];
          if (tokenInvoked && named) return named;
          if (named) return `Token error: ${named}`;
          return `Instruction failed (custom error 0x${custom.toString(16)})`;
        }
        return `Instruction failed: ${JSON.stringify(inner)}`;
      }
    }
  }

  // 3. Insufficient lamports / similar comes through in the logs as a
  //    "Transfer: insufficient lamports" or "insufficient funds" line.
  const fundsLine = logs.find(
    (l) => l.toLowerCase().includes("insufficient") || l.toLowerCase().includes("failed")
  );
  if (fundsLine) return fundsLine.replace(/^Program log: /, "");

  // 4. Last resort — dump the last log line, or a stringified err.
  const last = logs[logs.length - 1];
  if (last) return last.replace(/^Program log: /, "");
  return `Transaction simulation failed: ${typeof err === "string" ? err : JSON.stringify(err)}`;
}

// ---------------------------------------------------------------------------
// User-facing translator
// ---------------------------------------------------------------------------
//
// explainSolanaError() is for the "showToast / alert" path — it takes an
// arbitrary error thrown by Anchor, web3.js, wallet-adapter, or our own
// helpers, and returns a one-line plain-English string. Console still gets
// the original for debugging; this is purely for UI.

const WALLET_REJECT_PATTERNS = [
  /user rejected/i,
  /user declined/i,
  /user denied/i,
  /request rejected/i,
  /transaction was not signed/i,
  /rejected by user/i,
  /user abort/i,
];

// Ordered most-specific first.
const PATTERN_MAP: Array<[RegExp, string]> = [
  [/insufficient lamports/i, "Not enough SOL in your wallet to cover fees. Top up and try again."],
  [/insufficient funds/i, "Insufficient balance for this transaction."],
  [/insufficient tokens/i, "Not enough tokens in your wallet for this transaction."],
  [/account not found/i, "On-chain state changed before we could submit. Refresh and try again."],
  [/account does not exist/i, "On-chain state changed before we could submit. Refresh and try again."],
  [/blockhash not found/i, "Network was busy — the transaction expired before it landed. Try again."],
  [/block ?hash.*expired/i, "Network was busy — the transaction expired before it landed. Try again."],
  [/simulation failed/i, "The transaction can't land as-is. State may have changed — refresh and retry."],
  [/already in use/i, "An item with these parameters already exists."],
  [/signature verification failed/i, "Wallet signed with the wrong key. Try reconnecting."],
  [/timeout|timed out/i, "Network call timed out. Check your connection and try again."],
  [/failed to fetch|network request failed/i, "Couldn't reach Solana. Check your connection and try again."],
  [/429|rate ?limit/i, "Rate-limited by the RPC. Wait a moment and try again."],
];

/** Pulls the first meaningful string out of assorted error shapes. */
function extractRawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const withLogs = err as Error & { logs?: string[]; error?: { errorMessage?: string } };
    if (withLogs.error?.errorMessage) return withLogs.error.errorMessage;
    if (Array.isArray(withLogs.logs)) {
      const hit = withLogs.logs.find((l) => /Error Message|custom program error/i.test(l));
      if (hit) return `${err.message} — ${hit}`;
    }
    return err.message;
  }
  if (typeof err === "object") {
    const msg = (err as { message?: string; error?: string }).message ??
      (err as { error?: string }).error;
    if (msg) return String(msg);
  }
  return "";
}

/** Strip base58 hashes and stack markers from a message. */
function sanitize(msg: string): string {
  return msg
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g, "…")
    .replace(/\s+at\s.*$/s, "")
    .trim();
}

export function explainSolanaError(err: unknown): string {
  const raw = extractRawMessage(err);
  if (!raw) return "Something went wrong. Please try again.";

  if (WALLET_REJECT_PATTERNS.some((p) => p.test(raw))) {
    return "Transaction cancelled in wallet.";
  }

  for (const [pattern, friendly] of PATTERN_MAP) {
    if (pattern.test(raw)) return friendly;
  }

  const cleaned = sanitize(raw);
  if (!cleaned) return "Something went wrong. Please try again.";
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned;
}

/** True when the error is a user-rejected wallet signature. Callers may
 *  silently swallow these (don't toast) since it's not a real failure. */
export function isWalletRejection(err: unknown): boolean {
  const raw = extractRawMessage(err);
  return WALLET_REJECT_PATTERNS.some((p) => p.test(raw));
}
