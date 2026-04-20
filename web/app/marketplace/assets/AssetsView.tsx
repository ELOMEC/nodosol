"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { mintProgram } from "@/lib/rwa";

type AssetRow = {
  address: string;
  mint: string;
  assetId: string;
  category: string;
  status: "Active" | "Paused" | "Retired";
  quantity: number;
  burned: number;
  deliveryRequired: boolean;
  name: string;
  symbol: string;
  metadataUri: string;
  createdAt: number;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; rows: AssetRow[] }
  | { kind: "error"; message: string };

const CATEGORY_LABEL: Record<string, string> = {
  commodity: "Commodity",
  realEstate: "Real Estate",
  debt: "Debt",
  equity: "Equity",
  ticket: "Ticket",
  carbon: "Carbon",
  other: "Other",
};

const CATEGORY_GRADIENT: Record<string, string> = {
  commodity: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  realEstate: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
  debt: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
  equity: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
  ticket: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  carbon: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
  other: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
};

export function AssetsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [busyAsset, setBusyAsset] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const accountApi = (program.account as Record<string, {
        all: (filters: unknown[]) => Promise<Array<{
          publicKey: PublicKey;
          account: {
            issuerOwner: PublicKey;
            mint: PublicKey;
            assetId: BN;
            category: Record<string, unknown>;
            status: Record<string, unknown>;
            quantity: BN;
            burnedAmount: BN;
            deliveryRequired: boolean;
            name: string;
            symbol: string;
            metadataUri: string;
            createdAt: BN;
          };
        }>>;
      }>).asset;
      // memcmp at offset 8 matches the issuer_owner Pubkey (first field after the 8-byte discriminator).
      const filters = [
        {
          memcmp: {
            offset: 8,
            bytes: publicKey.toBase58(),
          },
        },
      ];
      const items = await accountApi.all(filters);
      const rows: AssetRow[] = items.map(({ publicKey: addr, account }) => ({
        address: addr.toBase58(),
        mint: account.mint.toBase58(),
        assetId: account.assetId.toString(),
        category: decodeCategory(account.category),
        status: decodeStatus(account.status),
        quantity: account.quantity.toNumber(),
        burned: account.burnedAmount.toNumber(),
        deliveryRequired: account.deliveryRequired,
        name: account.name,
        symbol: account.symbol,
        metadataUri: account.metadataUri,
        createdAt: account.createdAt.toNumber(),
      }));
      rows.sort((a, b) => b.createdAt - a.createdAt);
      setState({ kind: "ready", rows });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Fetch failed";
      setState({ kind: "error", message });
    }
  }, [connection, publicKey, wallet]);

  useEffect(() => {
    if (connected && publicKey) {
      void reload();
    } else {
      setState({ kind: "idle" });
    }
  }, [connected, publicKey, reload]);

  async function burnOne(row: AssetRow) {
    if (!publicKey) return;
    const amount = window.prompt(`Burn how many ${row.symbol}? (circulating: ${row.quantity - row.burned})`);
    if (!amount) return;
    const qty = Number(amount);
    if (!Number.isInteger(qty) || qty <= 0 || qty > row.quantity - row.burned) {
      window.alert("Invalid amount");
      return;
    }
    setBusyAsset(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const mint = new PublicKey(row.mint);
      const ata = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = await program.methods
        .burnTokens(new BN(qty))
        .accounts({
          issuerOwner: publicKey,
          asset: new PublicKey(row.address),
          mint,
          issuerTokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Burn failed");
    } finally {
      setBusyAsset(null);
    }
  }

  async function transitionStatus(row: AssetRow, next: "Active" | "Paused" | "Retired") {
    if (!publicKey) return;
    setBusyAsset(row.address);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const ix = await program.methods
        .updateAssetStatus({ [next.toLowerCase()]: {} } as never)
        .accounts({
          issuerOwner: publicKey,
          asset: new PublicKey(row.address),
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusyAsset(null);
    }
  }

  if (!connected) {
    return (
      <EmptyShell>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.3rem" }}>Connect wallet</h3>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", marginBottom: "1rem" }}>
            Connect a Solana wallet to view your tokenised assets.
          </p>
          <WalletMultiButton />
        </div>
      </EmptyShell>
    );
  }

  if (state.kind === "loading") {
    return <EmptyShell>Loading your assets from Solana…</EmptyShell>;
  }

  if (state.kind === "error") {
    return <EmptyShell>Failed to load: {state.message}</EmptyShell>;
  }

  const rows = state.kind === "ready" ? state.rows : [];
  const activeCount = rows.filter((r) => r.status === "Active").length;
  const retiredCount = rows.filter((r) => r.status === "Retired").length;
  const totalCirculating = rows.reduce((s, r) => s + (r.quantity - r.burned), 0);
  const totalBurned = rows.reduce((s, r) => s + r.burned, 0);

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            My assets
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Assets you have tokenised as an issuer. Issuer wallet:{" "}
            <span style={{ color: "#111827", fontWeight: 500 }}>{publicKey && shorten(publicKey.toBase58())}</span>
          </p>
        </div>
        <Link
          href="/marketplace/tokenize"
          style={{
            background: "#4f46e5",
            color: "#fff",
            padding: "0.6rem 1.15rem",
            borderRadius: 8,
            fontSize: "0.88rem",
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
          }}
        >
          + Tokenize asset
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Tokenised assets" value={rows.length.toString()} sub={`${activeCount} active · ${retiredCount} retired`} />
        <StatCard label="Tokens in circulation" value={totalCirculating.toString()} sub={`${totalBurned} burned`} />
        <StatCard label="Distinct mints" value={new Set(rows.map((r) => r.mint)).size.toString()} sub="Fixed-supply Token-2022" />
        <StatCard label="Issuer status" value="Active" valueColor="#059669" sub="SRB · Commodity, Ticket" />
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1.2rem", borderBottom: "1px solid #eef0f3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Tokenised assets</h3>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.15rem" }}>
              Live from on-chain. {rows.length} total.
            </p>
          </div>
          <button
            onClick={() => void reload()}
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#374151",
              padding: "0.4rem 0.9rem",
              borderRadius: 6,
              fontSize: "0.82rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#6b7280" }}>
            <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
              No tokenised assets yet
            </div>
            <div style={{ fontSize: "0.88rem", marginBottom: "1.2rem" }}>
              Tokenise your first asset to see it here.
            </div>
            <Link
              href="/marketplace/tokenize"
              style={{
                display: "inline-block",
                background: "#4f46e5",
                color: "#fff",
                padding: "0.6rem 1.15rem",
                borderRadius: 8,
                fontSize: "0.88rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Tokenize asset
            </Link>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "#fafbfc", color: "#6b7280", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
                <Th>Asset</Th>
                <Th>Category</Th>
                <Th>Supply</Th>
                <Th>Status</Th>
                <Th>Tokenised</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address} style={{ borderTop: "1px solid #f1f2f4", opacity: busyAsset === r.address ? 0.5 : 1 }}>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 8, background: CATEGORY_GRADIENT[r.category] ?? "#ccc" }} />
                      <div>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{r.name || "(unnamed)"}</div>
                        <div style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
                          {r.symbol} · {shorten(r.mint)}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span style={{ fontSize: "0.78rem", color: "#6b7280", background: "#f3f4f6", padding: "0.2rem 0.55rem", borderRadius: 4, fontWeight: 500 }}>
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{r.quantity - r.burned}</div>
                    {r.burned > 0 ? (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                        {r.burned} burned of {r.quantity}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>of {r.quantity} total</div>
                    )}
                  </Td>
                  <Td>
                    <StatusPill status={r.status} />
                  </Td>
                  <Td style={{ color: "#6b7280" }}>
                    {new Date(r.createdAt * 1000).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Td>
                  <Td align="right">
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      {r.status === "Active" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Paused")} disabled={busyAsset === r.address}>
                          Pause
                        </button>
                      ) : r.status === "Paused" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Active")} disabled={busyAsset === r.address}>
                          Resume
                        </button>
                      ) : null}
                      {r.status !== "Retired" ? (
                        <button style={actBtn} onClick={() => void transitionStatus(r, "Retired")} disabled={busyAsset === r.address}>
                          Retire
                        </button>
                      ) : null}
                      <button style={actBtn} onClick={() => void burnOne(r)} disabled={busyAsset === r.address || r.quantity - r.burned === 0}>
                        Burn
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function decodeStatus(raw: Record<string, unknown>): "Active" | "Paused" | "Retired" {
  if ("active" in raw) return "Active";
  if ("paused" in raw) return "Paused";
  if ("retired" in raw) return "Retired";
  return "Active";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          My assets
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Assets you have tokenised as an issuer.</p>
      </header>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          padding: "3rem 1.5rem",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        {children}
      </div>
    </>
  );
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: valueColor ?? "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", padding: "0.8rem 1.2rem", fontWeight: 600 }}>{children}</th>;
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: "1rem 1.2rem", verticalAlign: "middle", textAlign: align ?? "left", ...style }}>{children}</td>;
}

function StatusPill({ status }: { status: "Active" | "Paused" | "Retired" }) {
  const map = {
    Active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981" },
    Paused: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b" },
    Retired: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280" },
  };
  const c = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: c.bg,
        color: c.fg,
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {status}
    </span>
  );
}

const actBtn: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  color: "#374151",
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  fontSize: "0.78rem",
  fontWeight: 500,
  cursor: "pointer",
};
