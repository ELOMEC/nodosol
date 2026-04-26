"use client";

import type { ReactNode } from "react";

import { SolanaProviders } from "@/components/SolanaProviders";
import { ToastProvider } from "@/components/ToastProvider";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <SolanaProviders>
      <ToastProvider>{children}</ToastProvider>
    </SolanaProviders>
  );
}
