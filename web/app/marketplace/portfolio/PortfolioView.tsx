"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { fetchImagesForUris, toHttp } from "@/lib/metadataImages";
import { mintProgram, MINT_PROGRAM_ID } from "@/lib/rwa";

type Holding = {
  mint: string;
  amount: number;
  // Enriched from Asset PDA (if any).
  assetPda: string | null;
  name: string | null;
  symbol: string | null;
  category: string | null;
  deliveryRequired: boolean | null;
  issuerOwner: string | null;
  metadataUri: string | null;
  imageUrl: string | null;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; holdings: Holding[]; rwaHoldings: Holding[] }
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

export function PortfolioView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setState({ kind: "loading" });
    try {
      // All Token-2022 ATAs owned by the wallet.
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      });
      const all: Holding[] = tokenAccounts.value
        .map((acc) => {
          const parsed = acc.account.data.parsed.info;
          const mint = parsed.mint as string;
          const amount = Number(parsed.tokenAmount.uiAmountString);
          return {
            mint,
            amount,
            assetPda: null,
            name: null,
            symbol: null,
            category: null,
            deliveryRequired: null,
            issuerOwner: null,
            metadataUri: null,
            imageUrl: null,
          } as Holding;
        })
        .filter((h) => h.amount > 0);

      // Join against rwa_mint Asset PDAs. Fetch all for now (small dataset).
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);
      const assets = (await (program.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
            mint: PublicKey;
            category: Record<string, unknown>;
            name: string;
            symbol: string;
            deliveryRequired: boolean;
            issuerOwner: PublicKey;
            metadataUri: string;
          };
        }>>;
      }>).asset.all());
      const byMint = new Map<string, (typeof assets)[number]>();
      for (const a of assets) {
        byMint.set(a.account.mint.toBase58(), a);
      }
      // Fetch metadata images for the assets that match current holdings.
      const urisForHoldings = all
        .map((h) => byMint.get(h.mint)?.account.metadataUri)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      const imageByUri = await fetchImagesForUris(urisForHoldings);
      for (const h of all) {
        const match = byMint.get(h.mint);
        if (match) {
          h.assetPda = match.publicKey.toBase58();
          h.name = match.account.name;
          h.symbol = match.account.symbol;
          h.category = decodeCategory(match.account.category);
          h.deliveryRequired = match.account.deliveryRequired;
          h.issuerOwner = match.account.issuerOwner.toBase58();
          h.metadataUri = match.account.metadataUri;
          h.imageUrl = match.account.metadataUri
            ? imageByUri.get(match.account.metadataUri) ?? null
            : null;
        }
      }

      // Partition: RWA holdings (matched to Asset PDA) vs everything else (other Token-2022s).
      const rwaHoldings = all.filter((h) => h.assetPda !== null);
      const otherHoldings = all.filter((h) => h.assetPda === null);

      // Note: other holdings include mock USDC etc.; we still show them under "Other tokens".
      setState({ kind: "ready", holdings: otherHoldings, rwaHoldings });
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

  if (!connected) {
    return (
      <EmptyShell>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.3rem" }}>Connect wallet</h3>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", marginBottom: "1rem" }}>
            Connect a Solana wallet to view your RWA holdings.
          </p>
          <WalletMultiButton />
        </div>
      </EmptyShell>
    );
  }

  if (state.kind === "loading") {
    return <EmptyShell>Loading portfolio from Solana…</EmptyShell>;
  }
  if (state.kind === "error") {
    return <EmptyShell>Failed to load: {state.message}</EmptyShell>;
  }

  const { rwaHoldings, holdings: otherHoldings } = state.kind === "ready" ? state : { rwaHoldings: [], holdings: [] };
  const totalRwaTokens = rwaHoldings.reduce((s, h) => s + h.amount, 0);
  const distinctCategories = new Set(rwaHoldings.map((h) => h.category)).size;

  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Portfolio
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Tokenised assets held in your wallet{" "}
          <span style={{ color: "#111827", fontWeight: 500 }}>{publicKey && shorten(publicKey.toBase58())}</span>.
          Includes both assets you tokenised and ones you bought.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="RWA holdings" value={rwaHoldings.length.toString()} sub="distinct RWA mints" />
        <StatCard label="Total tokens" value={totalRwaTokens.toString()} sub="across all RWA positions" />
        <StatCard label="Categories" value={distinctCategories.toString()} sub="asset classes held" />
        <StatCard label="Other Token-2022" value={otherHoldings.length.toString()} sub="non-RWA balances" />
      </div>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>RWA holdings</h3>
        {rwaHoldings.length === 0 ? (
          <CenteredCard>
            <div style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.35rem" }}>
              No RWA tokens in wallet
            </div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280" }}>
              Buy a listing on the marketplace or tokenise an asset to see it here.
            </div>
          </CenteredCard>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1rem",
            }}
          >
            {rwaHoldings.map((h) => (
              <HoldingCard key={h.mint} holding={h} />
            ))}
          </div>
        )}
      </section>

      {otherHoldings.length > 0 ? (
        <section>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Other Token-2022 balances</h3>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #eef0f3",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#fafbfc", color: "#6b7280", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ textAlign: "left", padding: "0.8rem 1.2rem", fontWeight: 600 }}>Mint</th>
                  <th style={{ textAlign: "right", padding: "0.8rem 1.2rem", fontWeight: 600 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {otherHoldings.map((h) => (
                  <tr key={h.mint} style={{ borderTop: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "0.85rem 1.2rem" }}>
                      <code style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "#4338ca", fontSize: "0.78rem" }}>
                        {shorten(h.mint)}
                      </code>
                    </td>
                    <td style={{ padding: "0.85rem 1.2rem", textAlign: "right", fontWeight: 600 }}>
                      {h.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function HoldingCard({ holding }: { holding: Holding }) {
  const gradient = CATEGORY_GRADIENT[holding.category ?? "other"] ?? CATEGORY_GRADIENT.other;
  const categoryLabel = CATEGORY_LABEL[holding.category ?? "other"] ?? "RWA";
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ background: holding.imageUrl ? "#111" : gradient, height: 90, position: "relative", overflow: "hidden" }}>
        {holding.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toHttp(holding.imageUrl)}
            alt={holding.name ?? "asset"}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(255,255,255,0.92)",
            padding: "0.18rem 0.55rem",
            borderRadius: 4,
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "#374151",
          }}
        >
          {categoryLabel}
        </div>
        {holding.deliveryRequired ? (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              background: "rgba(255,255,255,0.92)",
              color: "#4338ca",
              padding: "0.18rem 0.55rem",
              borderRadius: 4,
              fontSize: "0.68rem",
              fontWeight: 600,
            }}
          >
            Physical delivery
          </div>
        ) : null}
      </div>
      <div style={{ padding: "0.95rem 1.05rem 1.05rem" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem" }}>
          {holding.name ?? "(unnamed asset)"}
        </div>
        <div style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace", marginBottom: "0.8rem" }}>
          {holding.symbol ?? "—"} · {shorten(holding.mint)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>{holding.amount.toLocaleString()}</div>
            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>tokens held</div>
          </div>
          {holding.issuerOwner ? (
            <div style={{ fontSize: "0.72rem", color: "#6b7280", textAlign: "right" }}>
              <div>Issuer</div>
              <div style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>{shorten(holding.issuerOwner)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function decodeCategory(raw: Record<string, unknown>): string {
  for (const k of Object.keys(raw)) return k;
  return "other";
}

function shorten(s: string): string {
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Portfolio
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Tokenised assets held in your wallet.</p>
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

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "2.5rem 1.5rem",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}
