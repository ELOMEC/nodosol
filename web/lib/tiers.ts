import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

import { tierPda, TierStatusKey } from "./eventTickets";

function colorToBytes(hex: string): number[] {
  const stripped = hex.replace(/^#/, "").padEnd(6, "0").slice(0, 6).toUpperCase();
  return Array.from(Buffer.from(stripped, "utf8"));
}

function statusToVariant(status: TierStatusKey): Record<string, Record<string, never>> {
  return { [status]: {} };
}

export async function buildCreateTierIx(
  program: Program,
  creator: PublicKey,
  event: PublicKey,
  tierId: number,
  name: string,
  sectionCode: string,
  priceBase: bigint,
  capacity: number,
  colorHex: string
): Promise<TransactionInstruction> {
  const [tier] = tierPda(event, tierId);
  return program.methods
    .createTier(
      tierId,
      name,
      sectionCode,
      new BN(priceBase.toString()),
      capacity,
      colorToBytes(colorHex)
    )
    .accounts({
      creator,
      event,
      tier,
      systemProgram: SystemProgram.programId,
    } as never)
    .instruction();
}

export async function buildUpdateTierPriceIx(
  program: Program,
  creator: PublicKey,
  event: PublicKey,
  tierId: number,
  newPriceBase: bigint
): Promise<TransactionInstruction> {
  const [tier] = tierPda(event, tierId);
  return program.methods
    .updateTierPrice(new BN(newPriceBase.toString()))
    .accounts({
      creator,
      event,
      tier,
    } as never)
    .instruction();
}

export async function buildUpdateTierCapacityIx(
  program: Program,
  creator: PublicKey,
  event: PublicKey,
  tierId: number,
  newCapacity: number
): Promise<TransactionInstruction> {
  const [tier] = tierPda(event, tierId);
  return program.methods
    .updateTierCapacity(newCapacity)
    .accounts({
      creator,
      event,
      tier,
    } as never)
    .instruction();
}

export async function buildUpdateTierStatusIx(
  program: Program,
  creator: PublicKey,
  event: PublicKey,
  tierId: number,
  newStatus: TierStatusKey
): Promise<TransactionInstruction> {
  const [tier] = tierPda(event, tierId);
  return program.methods
    .updateTierStatus(statusToVariant(newStatus))
    .accounts({
      creator,
      event,
      tier,
    } as never)
    .instruction();
}
