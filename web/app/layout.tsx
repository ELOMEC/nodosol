import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@/components/Analytics";
import { ConsentBanner } from "@/components/ConsentBanner";
import { InstallPrompt } from "@/components/InstallPrompt";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nodosol.com"),
  title: {
    default: "nodosol — Solana super-app for compliant RWA + creator payments",
    template: "%s — nodosol",
  },
  description:
    "Tokenize real-world assets, sell event tickets, rent out property, and take creator payments on Solana. Licenced RWA issuer framework, Token-2022 rails, confidential-ready architecture.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Nodosol",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "nodosol — Solana super-app for compliant RWA + creator payments",
    description:
      "Licenced RWA + event tickets + rentals + OTC escrow on Solana. Token-2022, multisig-governed, confidential-ready.",
    url: "https://nodosol.com",
    siteName: "nodosol",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "nodosol — Solana super-app for compliant RWA + creator payments",
    description:
      "Licenced RWA + event tickets + rentals + OTC escrow on Solana.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Resource hints for the highest-traffic external origins —
            preconnect cuts TLS handshake from the critical path on the
            first RPC + Supabase call. dns-prefetch is a fallback for
            UAs that ignore preconnect. */}
        <link rel="preconnect" href="https://devnet.helius-rpc.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://devnet.helius-rpc.com" />
        <link rel="preconnect" href="https://xvgxaodxylrolkpyuszx.supabase.co" crossOrigin="" />
        <link rel="dns-prefetch" href="https://xvgxaodxylrolkpyuszx.supabase.co" />
        {/* GA4 — beforeInteractive snippet sets default-denied consent
            BEFORE the loader fires; ConsentBanner flips it on accept. */}
        <Analytics />
      </head>
      <body>
        <a href="#main-content" className="nds-skip-link">
          Skip to main content
        </a>
        {children}
        <InstallPrompt />
        <ConsentBanner />
      </body>
    </html>
  );
}
