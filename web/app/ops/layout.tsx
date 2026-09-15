"use client";

import type { ReactNode } from "react";

import { SolanaProviders } from "@/components/SolanaProviders";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
