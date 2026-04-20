import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import eventTicketsIdl from "../idl/event_tickets.json";

export const EVENT_TICKETS_PROGRAM_ID = new PublicKey(
  (eventTicketsIdl as { address: string }).address
);

// Pinned SPL / Metaplex program addresses (same on devnet + mainnet).
export const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);
export const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);
export const NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

// Tree parameters — match the Rust program constants.
export const TREE_MAX_DEPTH = 14;
export const TREE_MAX_BUFFER_SIZE = 64;
export const TREE_CANOPY_DEPTH = 0;

// SPL Account Compression account layout for (14, 64, 0). See
// programs/event_tickets/tests/common/mod.rs for the byte-by-byte breakdown.
// Matches Metaplex `getConcurrentMerkleTreeAccountSize(14, 64, 0) = 31_800`.
export const MERKLE_TREE_ACCOUNT_SIZE = 31_800;

const CONFIG_SEED = Buffer.from("config");
const EVENT_SEED = Buffer.from("event");
const VAULT_SEED = Buffer.from("vault");

export function eventTicketsConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], EVENT_TICKETS_PROGRAM_ID);
}

export function eventPda(
  creator: PublicKey,
  eventId: bigint
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(eventId);
  return PublicKey.findProgramAddressSync(
    [EVENT_SEED, creator.toBuffer(), idBuf],
    EVENT_TICKETS_PROGRAM_ID
  );
}

export function eventVaultPda(event: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, event.toBuffer()],
    EVENT_TICKETS_PROGRAM_ID
  );
}

/// Bubblegum derives tree_config from [merkle_tree].
export function treeConfigPda(merkleTree: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID);
}

export function eventTicketsProgram(provider: AnchorProvider): Program {
  return new Program(eventTicketsIdl as Idl, provider);
}

export type EventStatusKey = "active" | "paused" | "closed";

export function decodeEventStatus(raw: Record<string, unknown>): EventStatusKey {
  if ("active" in raw) return "active";
  if ("paused" in raw) return "paused";
  if ("closed" in raw) return "closed";
  return "active";
}

export type EventTicketsConfig = {
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
};

export async function fetchEventTicketsConfig(
  program: Program
): Promise<EventTicketsConfig> {
  const [address] = eventTicketsConfigPda();
  const account = await (program.account as Record<string, {
    fetch: (addr: PublicKey) => Promise<{
      authority: PublicKey;
      treasury: PublicKey;
      feeBps: number;
    }>;
  }>).config.fetch(address);
  return {
    address,
    authority: account.authority,
    treasury: account.treasury,
    feeBps: account.feeBps,
  };
}

/**
 * Builds the SystemProgram.createAccount instruction for a fresh Merkle tree
 * account owned by the Account Compression program with the correct size.
 *
 * The caller must sign with `merkleTree` (the keypair owning this address) so
 * the lamports transfer + allocation goes through.
 */
export function buildCreateMerkleTreeAccountIx(
  payer: PublicKey,
  merkleTree: PublicKey,
  rentLamports: number
): TransactionInstruction {
  return SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: merkleTree,
    lamports: rentLamports,
    space: MERKLE_TREE_ACCOUNT_SIZE,
    programId: ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
}
