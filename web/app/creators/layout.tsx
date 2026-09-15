"use client";

import type { ReactNode } from "react";

import { SolanaProviders } from "@/components/SolanaProviders";

export default function CreatorsLayout({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
