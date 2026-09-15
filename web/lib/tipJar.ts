import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import tipJarIdl from "../idl/tip_jar.json";

export const TIP_JAR_PROGRAM_ID = new PublicKey(
  (tipJarIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const CREATOR_SEED = Buffer.from("creator");
const VAULT_SEED = Buffer.from("vault");

export function tipJarConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], TIP_JAR_PROGRAM_ID);
}

export function creatorProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CREATOR_SEED, owner.toBuffer()],
    TIP_JAR_PROGRAM_ID
  );
}

export function creatorVaultPda(profile: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, profile.toBuffer()],
    TIP_JAR_PROGRAM_ID
  );
}

export function tipJarProgram(provider: AnchorProvider): Program {
  return new Program(tipJarIdl as Idl, provider);
}

export type CreatorProfileDoc = {
  address: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  totalTipsAmount: bigint;
  totalTipCount: number;
  totalWithdrawnAmount: bigint;
  createdAt: number;
};

export async function fetchCreatorProfile(
  program: Program,
  owner: PublicKey
): Promise<CreatorProfileDoc | null> {
  const [address] = creatorProfilePda(owner);
  const api = (program.account as Record<string, {
    fetchNullable: (addr: PublicKey) => Promise<{
      owner: PublicKey;
      mint: PublicKey;
      vault: PublicKey;
      totalTipsAmount: { toString(): string };
      totalTipCount: { toNumber(): number };
      totalWithdrawnAmount: { toString(): string };
      createdAt: { toNumber(): number };
    } | null>;
  }>).creatorProfile;
  const raw = await api.fetchNullable(address);
  if (!raw) return null;
  return {
    address,
    owner: raw.owner,
    mint: raw.mint,
    vault: raw.vault,
    totalTipsAmount: BigInt(raw.totalTipsAmount.toString()),
    totalTipCount: raw.totalTipCount.toNumber(),
    totalWithdrawnAmount: BigInt(raw.totalWithdrawnAmount.toString()),
    createdAt: raw.createdAt.toNumber(),
  };
}
