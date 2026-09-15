"use client";

import { ReactNode } from "react";
import { SolanaProviders } from "@/components/SolanaProviders";

export function AdminProviders({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
