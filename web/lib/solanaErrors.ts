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
