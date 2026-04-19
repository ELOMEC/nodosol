"use client";

import { Blink, useAction } from "@dialectlabs/blinks";
import { useBlinkSolanaWalletAdapter } from "@dialectlabs/blinks/hooks/solana";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect } from "react";

export function ClientBlinkView({ actionUrl }: { actionUrl: string }) {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const { adapter } = useBlinkSolanaWalletAdapter(connection);
  const { action, isLoading } = useAction({ url: actionUrl });

  // Re-bind the adapter whenever the connection / wallet changes so the
  // signing path always points at the active wallet.
  useEffect(() => {
    // The adapter closes over the current wallet context; nothing to do
    // explicitly here beyond the hook re-render, but keep this for the
    // chat-level invariant.
  }, [connected]);

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <a href="/" style={styles.brand}>
          nodosol
        </a>
        <WalletMultiButton />
      </header>

      {isLoading ? (
        <p style={styles.muted}>Loading action…</p>
      ) : !action ? (
        <p style={styles.error}>
          Could not load action from:
          <br />
          <code>{actionUrl}</code>
        </p>
      ) : (
        <div style={styles.blinkFrame}>
          <Blink blink={action} adapter={adapter} stylePreset="x-dark" />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "2rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    color: "#e8e8e8",
    fontSize: "1.5rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textDecoration: "none",
  },
  muted: { color: "#9a9a9a", textAlign: "center" },
  error: { color: "#ff5c5c", textAlign: "center", lineHeight: 1.6 },
  blinkFrame: {
    background: "#0f0f0f",
    borderRadius: 12,
    padding: 8,
    border: "1px solid #222",
  },
};
