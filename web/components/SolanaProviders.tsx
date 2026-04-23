"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ReactNode, useMemo } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

import { PrivyProviders } from "./PrivyProviders";
import { PrivyWalletBridge } from "./PrivyWalletBridge";
import { ToastProvider } from "./ToastProvider";
import { PrivyWalletAdapter } from "@/lib/privyWalletAdapter";

const DEFAULT_RPC = "https://api.devnet.solana.com";

export function SolanaProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC;
  const privyAdapter = useMemo(() => new PrivyWalletAdapter(), []);
  const wallets = useMemo(
    () => [privyAdapter, new PhantomWalletAdapter(), new BackpackWalletAdapter()],
    [privyAdapter]
  );

  return (
    <ToastProvider>
      <PrivyProviders>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <PrivyWalletBridge adapter={privyAdapter}>
                {children}
              </PrivyWalletBridge>
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </PrivyProviders>
    </ToastProvider>
  );
}
