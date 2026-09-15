import { PublicKey } from "@solana/web3.js";

import { creatorProfilePda } from "./pdas";
import { tipJarProgram } from "./programs";

export type CreatorProfile = {
  address: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  totalTipsAmount: bigint;
  totalTipCount: bigint;
  totalWithdrawnAmount: bigint;
  elgamalPubkey: Uint8Array;
};

/**
 * Fetches a creator profile by the creator wallet address. Returns
 * null if the creator has not initialised a profile yet.
 */
export async function fetchCreatorProfile(
  creatorWallet: PublicKey
): Promise<CreatorProfile | null> {
  const [address] = creatorProfilePda(creatorWallet);
  const program = tipJarProgram();
  try {
    const profile = await (
      program.account as unknown as {
        creatorProfile: {
          fetchNullable: (addr: PublicKey) => Promise<{
            owner: PublicKey;
            mint: PublicKey;
            vault: PublicKey;
            totalTipsAmount: { toString: () => string };
            totalTipCount: { toString: () => string };
            totalWithdrawnAmount: { toString: () => string };
            elgamalPubkey: number[];
          } | null>;
        };
      }
    ).creatorProfile.fetchNullable(address);
    if (!profile) return null;
    return {
      address,
      owner: profile.owner,
      mint: profile.mint,
      vault: profile.vault,
      totalTipsAmount: BigInt(profile.totalTipsAmount.toString()),
      totalTipCount: BigInt(profile.totalTipCount.toString()),
      totalWithdrawnAmount: BigInt(profile.totalWithdrawnAmount.toString()),
      elgamalPubkey: Uint8Array.from(profile.elgamalPubkey),
    };
  } catch (err) {
    console.error("fetchCreatorProfile failed", err);
    return null;
  }
}
