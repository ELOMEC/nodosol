"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { ReactNode, useEffect } from "react";

import {
  PrivyWalletAdapter,
  PrivyWalletName,
} from "@/lib/privyWalletAdapter";

export function PrivyWalletBridge({
  adapter,
  children,
}: {
  adapter: PrivyWalletAdapter;
  children: ReactNode;
}) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;
  return <Inner adapter={adapter}>{children}</Inner>;
}

function Inner({
  adapter,
  children,
}: {
  adapter: PrivyWalletAdapter;
  children: ReactNode;
}) {
  const { authenticated, ready } = usePrivy();
  const { wallets, ready: walletsReady } = useSolanaWallets();
  const { select, wallet, connected, connecting } = useWallet();

  const privyWallet = wallets[0];

  useEffect(() => {
    if (!ready || !walletsReady) return;

    if (authenticated && privyWallet) {
      adapter.setSource({
        address: privyWallet.address,
        signMessage: privyWallet.signMessage.bind(privyWallet),
        signTransaction: privyWallet.signTransaction.bind(privyWallet),
        signAllTransactions: privyWallet.signAllTransactions.bind(privyWallet),
      });
      const other = wallet && wallet.adapter.name !== PrivyWalletName;
      if (!other && !connected && !connecting) {
        select(PrivyWalletName);
      }
    } else {
      adapter.setSource(null);
    }
  }, [
    ready,
    walletsReady,
    authenticated,
    privyWallet,
    adapter,
    select,
    wallet,
    connected,
    connecting,
  ]);

  return <>{children}</>;
}
