import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import marketplaceIdl from "../idl/marketplace.json";

export const MARKETPLACE_PROGRAM_ID = new PublicKey(
  (marketplaceIdl as { address: string }).address
);

const CONFIG_SEED = Buffer.from("config");
const LISTING_SEED = Buffer.from("listing");
const VAULT_SEED = Buffer.from("vault");

export function marketplaceConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], MARKETPLACE_PROGRAM_ID);
}

export function listingPda(
  seller: PublicKey,
  assetMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [LISTING_SEED, seller.toBuffer(), assetMint.toBuffer()],
    MARKETPLACE_PROGRAM_ID
  );
}

export function listingVaultPda(listing: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, listing.toBuffer()],
    MARKETPLACE_PROGRAM_ID
  );
}

export function marketplaceProgram(provider: AnchorProvider): Program {
  return new Program(marketplaceIdl as Idl, provider);
}

export type ListingStatusKey = "active" | "cancelled" | "soldOut";

export function decodeListingStatus(raw: Record<string, unknown>): ListingStatusKey {
  if ("active" in raw) return "active";
  if ("cancelled" in raw) return "cancelled";
  if ("soldOut" in raw) return "soldOut";
  return "active";
}

export type MarketplaceConfig = {
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
};

export async function fetchMarketplaceConfig(
  program: Program
): Promise<MarketplaceConfig> {
  const [address] = marketplaceConfigPda();
  const account = (await (program.account as Record<string, {
    fetch: (addr: PublicKey) => Promise<{
      authority: PublicKey;
      treasury: PublicKey;
      feeBps: number;
    }>;
  }>).config.fetch(address));
  return {
    address,
    authority: account.authority,
    treasury: account.treasury,
    feeBps: account.feeBps,
  };
}
