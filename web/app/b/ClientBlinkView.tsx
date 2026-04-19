"use client";

import { Blink, useAction } from "@dialectlabs/blinks";
import { useBlinkSolanaWalletAdapter } from "@dialectlabs/blinks/hooks/solana";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState } from "react";

export function ClientBlinkView({ actionUrl }: { actionUrl: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { adapter } = useBlinkSolanaWalletAdapter(connection);
  const { action, isLoading } = useAction({ url: actionUrl });

  const [copied, setCopied] = useState(false);
  const fullAddress = publicKey?.toBase58() ?? null;

  const copyAddress = async () => {
    if (!fullAddress) return;
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard errors (e.g. insecure context); UI stays unchanged.
    }
  };

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <a href="/" style={styles.brand}>
          nodosol
        </a>
        <WalletMultiButton />
      </header>

      {fullAddress ? (
        <div style={styles.addressCard}>
          <div style={styles.addressLabel}>Your devnet wallet</div>
          <div style={styles.addressRow}>
            <code style={styles.addressValue}>{fullAddress}</code>
            <button onClick={copyAddress} style={styles.copyBtn}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={styles.addressHint}>
            Share this with nodosol to get devnet mock USDC minted for
            testing.
          </div>
        </div>
      ) : null}

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
          <Blink
            blink={action}
            adapter={adapter}
            stylePreset="x-dark"
            securityLevel="all"
          />
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
  addressCard: {
    background: "#121212",
    border: "1px solid #222",
    borderRadius: 10,
    padding: "0.75rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  addressLabel: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: "#7a7a7a",
  },
  addressRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  addressValue: {
    flex: 1,
    color: "#e8e8e8",
    fontSize: "0.78rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  copyBtn: {
    background: "#1f1f1f",
    color: "#e8e8e8",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "0.35rem 0.7rem",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  addressHint: {
    color: "#6a6a6a",
    fontSize: "0.75rem",
    lineHeight: 1.4,
  },
};
