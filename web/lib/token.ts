import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

const SUPPORTED_PROGRAMS = new Set([
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
]);

export async function getTokenProgramForMint(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) {
    throw new Error(`Mint ${mint.toBase58()} not found on this cluster`);
  }
  const owner = info.owner.toBase58();
  if (!SUPPORTED_PROGRAMS.has(owner)) {
    throw new Error(
      `Mint ${mint.toBase58()} is not owned by a supported token program`
    );
  }
  return info.owner;
}

export function ata(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey
): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}
