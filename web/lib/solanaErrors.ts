// Convert the raw output of RpcConnection.simulateTransaction() into a
// human-readable one-liner for window.alert. Phantom hides everything
// behind "Unexpected error" when preflight fails, so surfacing the real
// program log saves a Solana-Explorer round-trip during testing.

type SimulationErr = unknown;

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
