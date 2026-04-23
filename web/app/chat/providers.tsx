"use client";

import { ReactNode } from "react";
import { SolanaProviders } from "@/components/SolanaProviders";

export function ChatProviders({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
