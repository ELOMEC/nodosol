import { PublicKey } from "@solana/web3.js";

import { SUBSCRIPTION_PROGRAM_ID, TIP_JAR_PROGRAM_ID } from "./constants";

export function creatorProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), owner.toBuffer()],
    TIP_JAR_PROGRAM_ID
  );
}

export function creatorVaultPda(
  creatorProfile: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), creatorProfile.toBuffer()],
    TIP_JAR_PROGRAM_ID
  );
}

export function planPda(
  creator: PublicKey,
  planId: bigint
): [PublicKey, number] {
  const planIdBuf = Buffer.alloc(8);
  planIdBuf.writeBigUInt64LE(planId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), creator.toBuffer(), planIdBuf],
    SUBSCRIPTION_PROGRAM_ID
  );
}

export function planVaultPda(plan: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), plan.toBuffer()],
    SUBSCRIPTION_PROGRAM_ID
  );
}

export function subscriptionPda(
  plan: PublicKey,
  subscriber: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), plan.toBuffer(), subscriber.toBuffer()],
    SUBSCRIPTION_PROGRAM_ID
  );
}
