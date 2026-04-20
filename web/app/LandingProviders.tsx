"use client";

import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { ReactNode } from "react";

const DEFAULT_RPC = "https://api.devnet.solana.com";

export function LandingProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC;
  return <ConnectionProvider endpoint={endpoint}>{children}</ConnectionProvider>;
}
