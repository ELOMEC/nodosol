import { useEffect, useState } from "react";
import * as Linking from "expo-linking";

/**
 * Minimal wallet abstraction for the skeleton. Returns a pubkey the
 * user entered manually, and exposes a helper that hands the built
 * transaction off to Phantom via a `solana-action:` deep link — the
 * same contract dial.to uses, just triggered from a native button
 * instead of a browser.
 *
 * A full integration (Mobile Wallet Adapter on Android, universal
 * link flow on iOS) slots in later without changing the screen-level
 * callers.
 */

const STORAGE_KEY = "nodosol.wallet.pubkey";

export function useSessionWallet() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Note: when we integrate MWA / expo-secure-store, this becomes
    // an async load. For now we keep it in-memory to avoid adding
    // native deps to the scaffold.
    setLoaded(true);
  }, []);

  return {
    pubkey,
    setPubkey,
    loaded,
    clear: () => setPubkey(null),
  };
}

export async function openActionInWallet(actionUrl: string): Promise<void> {
  // `solana-action:` scheme is recognised by Phantom, Backpack, and
  // dial.to; the wallet fetches the URL, renders the Action, and
  // handles signing.
  const target = `solana-action:${actionUrl}`;
  const canOpen = await Linking.canOpenURL(target);
  if (canOpen) {
    await Linking.openURL(target);
    return;
  }
  // Fallback: hand off to the browser, which then redirects into the
  // installed wallet or dial.to.
  const dialTo = `https://dial.to/?action=solana-action:${encodeURIComponent(actionUrl)}`;
  await Linking.openURL(dialTo);
}

export const WALLET_STORAGE_KEY = STORAGE_KEY;
