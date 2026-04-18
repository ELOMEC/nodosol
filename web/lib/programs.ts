import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import tipJarIdl from "../idl/tip_jar.json";
import subscriptionIdl from "../idl/subscription.json";
import { getRpcUrl } from "./constants";

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

/**
 * Minimal Wallet adapter for a read-only Anchor provider. API routes
 * build instructions but never sign; the signing happens in the
 * user's wallet after the serialised transaction is returned.
 */
class ReadOnlyWallet {
  readonly payer: Keypair;
  readonly publicKey: PublicKey;

  constructor() {
    this.payer = Keypair.generate();
    this.publicKey = this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> {
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    return txs;
  }
}

export function getReadProvider(): AnchorProvider {
  const connection = getConnection();
  return new AnchorProvider(connection, new ReadOnlyWallet(), {
    preflightCommitment: "confirmed",
  });
}

export type TipJarProgram = Program;
export type SubscriptionProgram = Program;

export function tipJarProgram(provider = getReadProvider()): TipJarProgram {
  return new Program(tipJarIdl as never, provider);
}

export function subscriptionProgram(
  provider = getReadProvider()
): SubscriptionProgram {
  return new Program(subscriptionIdl as never, provider);
}

export { web3, PublicKey };
