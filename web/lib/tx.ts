import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";

import { decodeSimulationError } from "./solanaErrors";

/** Minimal wallet shape used by this helper. Both the wallet-adapter's
 *  WalletContextState and bespoke SendableWallet types in lib/ satisfy it. */
export type Sendable = {
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
};

type SendOptions = {
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  /** Optional skipSimulate for flows where the simulator's state-view
   *  diverges from real execution (e.g. legacy Compute Budget tricks).
   *  Default: simulate. */
  skipSimulate?: boolean;
};

/**
 * Build → preflight simulate → wallet.sendTransaction → confirm.
 *
 * The preflight turns Phantom's opaque "Unexpected error" into the
 * decoded program log before the user is prompted. Any flow that goes
 * through the wallet adapter should use this helper instead of wiring
 * connection.simulate / sendTransaction / confirmTransaction by hand.
 */
export async function simulateAndSend(
  connection: Connection,
  wallet: Sendable,
  { feePayer, instructions, skipSimulate }: SendOptions
): Promise<TransactionSignature> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash });
  for (const ix of instructions) tx.add(ix);

  if (!skipSimulate) {
    const vtx = new VersionedTransaction(tx.compileMessage());
    const sim = await connection.simulateTransaction(vtx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    if (sim.value.err) {
      const logs = sim.value.logs ?? [];
      console.error("simulate failed", sim.value.err, logs);
      throw new Error(decodeSimulationError(sim.value.err, logs));
    }
  }

  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}
