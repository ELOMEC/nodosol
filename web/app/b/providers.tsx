"use client";

import { ReactNode } from "react";

import "@dialectlabs/blinks/index.css";

import { SolanaProviders } from "@/components/SolanaProviders";

export function BlinkProviders({ children }: { children: ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
