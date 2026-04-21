"use client";

import { ReactNode } from "react";
import { SolanaProviders } from "@/components/SolanaProviders";

export function MarketplaceProviders({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
