"use client";

import type { ReactNode } from "react";

import { SolanaProviders } from "@/components/SolanaProviders";

export default function CreatorPublicLayout({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
