"use client";

import type { ReactNode } from "react";

import { SolanaProviders } from "@/components/SolanaProviders";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
