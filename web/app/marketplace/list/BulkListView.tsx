"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getUsdcMint, USDC_UNIT } from "@/lib/constants";
import {
  listingPda,
  listingVaultPda,
  marketplaceProgram,
} from "@/lib/marketplace";
import { mintProgram } from "@/lib/rwa";
import { explainSolanaError } from "@/lib/solanaErrors";
import { simulateAndSend } from "@/lib/tx";
import { useToast } from "@/components/ToastProvider";

type AssetRow = {
  address: string;
  mint: string;
  name: string;
  symbol: string;
  category: string;
  quantity: number;
};

type DraftState = {
  /** Whether the asset is checked for batch list. */
  selected: boolean;
  /** Per-asset price input (whole USDC, parsed to base units on submit). */
  price: string;
  /** Quantity to list (defaults to full asset quantity). */
  qty: string;
};

type SubmitProgress =
  | { kind: "idle" }
  | { kind: "running"; current: number; total: number; mint: string }
  | { kind: "done"; ok: number; failed: number };

const ASSET_OWNER_OFFSET = 8;

export function BulkListView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const toast = useToast();

  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SubmitProgress>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      type Account<T> = { publicKey: PublicKey; account: T };
      type RawAsset = {
        owner: PublicKey;
        mint: PublicKey;
        name: string;
        symbol: string;
        status: Record<string, unknown>;
        category: Record<string, unknown>;
        quantity: BN;
        burnedAmount: BN;
      };
      const accountApi = (program.account as Record<string, unknown>).asset as
        | { all: (filters?: ReadonlyArray<{ memcmp: { offset: number; bytes: string } }>) => Promise<Account<RawAsset>[]> }
        | undefined;
      if (!accountApi) {
        setError("rwa_mint program asset account missing from IDL");
        return;
      }
      const items = await accountApi.all([
        { memcmp: { offset: ASSET_OWNER_OFFSET, bytes: publicKey.toBase58() } },
      ]);
      const next: AssetRow[] = items
        .map(({ publicKey: addr, account }) => ({
          address: addr.toBase58(),
          mint: account.mint.toBase58(),
          name: account.name,
          symbol: account.symbol,
          category: Object.keys(account.category)[0] ?? "other",
          quantity:
            Number(account.quantity?.toString?.() ?? 0) -
            Number(account.burnedAmount?.toString?.() ?? 0),
          status: Object.keys(account.status)[0] ?? "active",
        }))
        .filter((r) => r.quantity > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setRows(next);
      setDrafts((prev) => {
        const merged: Record<string, DraftState> = {};
        for (const row of next) {
          merged[row.mint] = prev[row.mint] ?? {
            selected: false,
            price: "",
            qty: String(row.quantity),
          };
        }
        return merged;
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setBusy(false);
    }
  }, [publicKey, connection, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setRows(null);
  }, [connected, publicKey, reload]);

  function updateDraft(mint: string, patch: Partial<DraftState>) {
    setDrafts((prev) => ({ ...prev, [mint]: { ...prev[mint], ...patch } }));
  }

  function toggleAll(checked: boolean) {
    setDrafts((prev) => {
      const next: Record<string, DraftState> = {};
      for (const [mint, draft] of Object.entries(prev)) {
        next[mint] = { ...draft, selected: checked };
      }
      return next;
    });
  }

  const selectedCount = Object.values(drafts).filter((d) => d.selected).length;

  async function submitBatch() {
    if (!publicKey || !rows) return;
    const queue = rows.filter((r) => drafts[r.mint]?.selected);
    if (queue.length === 0) {
      toast.error("Pick at least one asset.");
      return;
    }
    // Validate every draft up front so we don't half-submit on a bad row.
    for (const row of queue) {
      const draft = drafts[row.mint];
      const priceNum = Number(draft.price);
      const qtyNum = Number(draft.qty);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        toast.error(`${row.name}: price must be > 0`);
        return;
      }
      if (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > row.quantity) {
        toast.error(`${row.name}: quantity must be 1–${row.quantity}`);
        return;
      }
    }

    setProgress({ kind: "running", current: 0, total: queue.length, mint: queue[0].mint });

    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = marketplaceProgram(provider);
    const paymentMint = getUsdcMint();

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];
      const draft = drafts[row.mint];
      setProgress({ kind: "running", current: i + 1, total: queue.length, mint: row.mint });
      try {
        const assetMint = new PublicKey(row.mint);
        const sellerAssetAta = getAssociatedTokenAddressSync(
          assetMint,
          publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );
        const [listing] = listingPda(publicKey, assetMint);
        const [vault] = listingVaultPda(listing);
        const priceBaseUnits = BigInt(Math.round(Number(draft.price) * USDC_UNIT));
        const ix = await program.methods
          .createListing(new BN(priceBaseUnits.toString()), new BN(Number(draft.qty)))
          .accounts({
            seller: publicKey,
            assetMint,
            paymentMint,
            listing,
            vault,
            sellerAssetAccount: sellerAssetAta,
            assetTokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        await simulateAndSend(connection, wallet, {
          feePayer: publicKey,
          instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
            ix,
          ],
        });
        ok++;
        toast.success(`Listed ${row.name}`);
      } catch (err) {
        failed++;
        console.error("bulk list failed for", row.mint, err);
        toast.error(`${row.name}: ${explainSolanaError(err)}`);
      }
    }

    setProgress({ kind: "done", ok, failed });
    if (ok > 0) {
      // Refresh so the just-listed assets disappear from the queue.
      void reload();
    }
  }

  if (!connected || !publicKey) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Bulk list assets</h1>
        <p style={SUB}>
          Connect a wallet to see your RWA inventory and list multiple
          assets at once.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Bulk list assets</h1>
          <p style={SUB}>
            Pick the assets you want on the marketplace, set the per-unit
            USDC price, and we&apos;ll submit one transaction per row in
            sequence. Each row that fails leaves the rest unaffected.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.55rem" }}>
          <button type="button" onClick={() => void reload()} disabled={busy} style={SECONDARY_BTN}>
            {busy ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void submitBatch()}
            disabled={busy || selectedCount === 0 || progress.kind === "running"}
            style={PRIMARY_BTN}
          >
            {progress.kind === "running"
              ? `Submitting ${progress.current}/${progress.total}…`
              : `List ${selectedCount} asset${selectedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      {progress.kind === "done" ? (
        <p
          style={{
            ...CARD_NOTE,
            color: progress.failed === 0 ? "#059669" : "#b45309",
          }}
        >
          Batch finished — {progress.ok} listed, {progress.failed} failed.
        </p>
      ) : null}

      {!rows ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : rows.length === 0 ? (
        <div style={CARD}>
          <h2 style={H2}>No tokenised assets</h2>
          <p style={CARD_SUB}>
            Tokenise an asset first from{" "}
            <Link href="/marketplace/tokenize" style={LINK}>
              Marketplace → Tokenize
            </Link>
            , then come back here to list it.
          </p>
        </div>
      ) : (
        <div style={CARD}>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Toggle all"
                    onChange={(e) => toggleAll(e.target.checked)}
                    checked={selectedCount > 0 && selectedCount === rows.length}
                  />
                </th>
                <th style={TH}>Asset</th>
                <th style={TH}>Category</th>
                <th style={{ ...TH, textAlign: "right" }}>Available</th>
                <th style={{ ...TH, textAlign: "right" }}>Qty</th>
                <th style={{ ...TH, textAlign: "right" }}>Price (USDC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.mint] ?? {
                  selected: false,
                  price: "",
                  qty: String(row.quantity),
                };
                return (
                  <tr key={row.mint}>
                    <td style={TD}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={draft.selected}
                        onChange={(e) => updateDraft(row.mint, { selected: e.target.checked })}
                      />
                    </td>
                    <td style={TD}>
                      <div style={ROW_PRIMARY}>{row.name}</div>
                      <div style={ROW_META}>
                        {row.symbol} · <code style={MONO}>{shortPubkey(row.mint)}</code>
                      </div>
                    </td>
                    <td style={TD}>{row.category}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{row.quantity}</td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <input
                        type="number"
                        min={1}
                        max={row.quantity}
                        value={draft.qty}
                        onChange={(e) => updateDraft(row.mint, { qty: e.target.value })}
                        style={NUM_INPUT}
                      />
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.price}
                        onChange={(e) => updateDraft(row.mint, { price: e.target.value })}
                        placeholder="0.00"
                        style={NUM_INPUT}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={NOTE}>
        Each row is its own transaction so the marketplace
        <code> create_listing</code> account-set fits inside Solana&apos;s
        per-tx size limit. Listings appear under{" "}
        <Link href="/marketplace/assets" style={LINK}>My assets</Link> as
        soon as they confirm.
      </p>
    </div>
  );
}

function shortPubkey(p: string): string {
  return p.length > 10 ? `${p.slice(0, 4)}…${p.slice(-4)}` : p;
}

const HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
  marginBottom: "1.5rem",
};

const H1: React.CSSProperties = {
  fontSize: "1.55rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  color: "var(--shell-fg)",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.9rem",
  lineHeight: 1.5,
  maxWidth: 620,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "0.85rem 1rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card-bg)",
  overflowX: "auto",
};

const CARD_NOTE: React.CSSProperties = {
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
};

const H2: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
  marginBottom: "0.4rem",
};

const LINK: React.CSSProperties = {
  color: "var(--shell-link)",
  textDecoration: "underline",
};

const TABLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.84rem",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "var(--shell-faint)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  whiteSpace: "nowrap" as const,
};

const TD: React.CSSProperties = {
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  color: "var(--shell-fg)",
};

const ROW_PRIMARY: React.CSSProperties = {
  fontWeight: 500,
};

const ROW_META: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-muted)",
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.78rem",
};

const NUM_INPUT: React.CSSProperties = {
  width: 92,
  padding: "0.3rem 0.5rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 6,
  background: "var(--shell-input-bg)",
  color: "var(--shell-fg)",
  fontSize: "0.84rem",
  textAlign: "right" as const,
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "var(--shell-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1rem",
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.55rem 1rem",
  fontSize: "0.88rem",
  cursor: "pointer",
};

const NOTE: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-faint)",
  marginTop: "0.85rem",
  lineHeight: 1.5,
  maxWidth: 620,
};
