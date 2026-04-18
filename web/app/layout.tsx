import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "nodosol — creator economy on Solana",
  description:
    "Patreon + tip jar + event tickets on Solana. 1% fee, instant USDC settlement, confidential-ready architecture.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
