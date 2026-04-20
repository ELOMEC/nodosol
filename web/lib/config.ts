import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const CONFIG_SEED = Buffer.from("config");

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export type FeeConfig = {
  address: PublicKey;
  authority: PublicKey;
  treasury: PublicKey;
  feeBps: number;
};

export async function fetchConfig(program: Program): Promise<FeeConfig> {
  const [address] = configPda(program.programId);
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
