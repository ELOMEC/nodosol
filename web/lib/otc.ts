import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import otcIdl from "../idl/otc_deals.json";
import { withConfigCache } from "./config";

export const OTC_PROGRAM_ID = new PublicKey(
  (otcIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const DEAL_SEED = Buffer.from("deal");
const VAULT_SEED = Buffer.from("vault");

export function otcConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], OTC_PROGRAM_ID);
}

export function dealPda(
  seller: PublicKey,
  buyer: PublicKey,
  dealId: bigint
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(dealId);
  return PublicKey.findProgramAddressSync(
    [DEAL_SEED, seller.toBuffer(), buyer.toBuffer(), idBuf],
    OTC_PROGRAM_ID
  );
}

export function dealVaultPda(deal: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, deal.toBuffer()],
    OTC_PROGRAM_ID
  );
}

export function otcProgram(provider: AnchorProvider): Program {
  return new Program(otcIdl as Idl, provider);
}

export type DealStatusKey = "proposed" | "accepted" | "cancelled" | "expired";

export function decodeDealStatus(raw: Record<string, unknown>): DealStatusKey {
  if ("proposed" in raw) return "proposed";
  if ("accepted" in raw) return "accepted";
  if ("cancelled" in raw) return "cancelled";
  if ("expired" in raw) return "expired";
  return "proposed";
}

export type OtcConfig = {
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
};

export async function fetchOtcConfig(program: Program): Promise<OtcConfig> {
  return withConfigCache(program.programId, "fee-config", async () => {
    const [address] = otcConfigPda();
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
  });
}

/**
 * Hash a memo string (typically a short free-text note describing the deal)
 * with SHA-256 and return the 32-byte digest. Used as the memo_hash field so
 * the on-chain record points at off-chain content without leaking it.
 */
export async function hashMemo(note: string): Promise<number[]> {
  const data = new TextEncoder().encode(note);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest));
}
