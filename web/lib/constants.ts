import { PublicKey } from "@solana/web3.js";

export const TIP_JAR_PROGRAM_ID = new PublicKey(
  "C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P"
);

export const SUBSCRIPTION_PROGRAM_ID = new PublicKey(
  "8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w"
);

// Devnet USDC-Dev mint (6 decimals).
// Override at runtime with NEXT_PUBLIC_USDC_MINT.
export const DEFAULT_USDC_MINT = new PublicKey(
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
);

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 10 ** USDC_DECIMALS;

export function getUsdcMint(): PublicKey {
  const configured = process.env.NEXT_PUBLIC_USDC_MINT;
  return configured ? new PublicKey(configured) : DEFAULT_USDC_MINT;
}

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
