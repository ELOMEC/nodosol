"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
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
          <p style={{ color: "var(--shell-muted)", fontSize: "0.88rem", marginBottom: "1rem" }}>
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
      <section
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #eaf2ff 100%)",
          border: "1px solid var(--shell-border)",
          borderRadius: 20,
          padding: "1.8rem",
          marginBottom: "1.25rem",
          boxShadow: "var(--brand-shadow)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.4rem", alignItems: "end" }} className="nds-market-hero-grid">
          <div>
            <div style={{ color: "var(--shell-link)", fontSize: "0.76rem", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Wallet portfolio
            </div>
            <h1 style={{ fontSize: "2.7rem", lineHeight: 1.05, letterSpacing: 0, fontWeight: 780, marginBottom: "0.85rem" }}>
              Holdings, positions, and market routes.
            </h1>
            <p style={{ color: "var(--shell-muted)", fontSize: "0.96rem", lineHeight: 1.65, maxWidth: 620 }}>
              Tokenised assets held by{" "}
              <span style={{ color: "var(--shell-fg)", fontWeight: 750 }}>{publicKey && shorten(publicKey.toBase58())}</span>.
              Use this as the starting point for resale, OTC, and portfolio review.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
            <StatCard label="RWA holdings" value={rwaHoldings.length.toString()} sub="distinct mints" />
            <StatCard label="Total tokens" value={totalRwaTokens.toString()} sub="RWA balance" />
            <StatCard label="Categories" value={distinctCategories.toString()} sub="asset classes" />
            <StatCard label="Other Token-2022" value={otherHoldings.length.toString()} sub="non-RWA balances" />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem", marginBottom: "0.85rem" }}>
          <div>
            <h3 style={{ fontSize: "1.08rem", fontWeight: 760, marginBottom: "0.15rem" }}>RWA holdings</h3>
            <p style={{ color: "var(--shell-muted)", fontSize: "0.84rem" }}>Assets joined with on-chain metadata and wallet balances.</p>
          </div>
          <Link href="/marketplace" style={portfolioLinkButton}>Browse market</Link>
        </div>
        {rwaHoldings.length === 0 ? (
          <CenteredCard>
            <div style={{ fontSize: "1rem", color: "var(--shell-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
              No RWA tokens in wallet
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--shell-muted)" }}>
              Buy a listing on the marketplace or tokenise an asset to see it here.
            </div>
          </CenteredCard>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1.1rem",
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
              background: "var(--shell-card)",
              border: "1px solid var(--shell-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--shell-card-alt)", color: "var(--shell-muted)", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ textAlign: "left", padding: "0.8rem 1.2rem", fontWeight: 600 }}>Mint</th>
                  <th style={{ textAlign: "right", padding: "0.8rem 1.2rem", fontWeight: 600 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {otherHoldings.map((h) => (
                  <tr key={h.mint} style={{ borderTop: "1px solid #f1f2f4" }}>
                    <td style={{ padding: "0.85rem 1.2rem" }}>
                      <Link
                        href={`/marketplace/assets/${h.mint}`}
                        style={{ fontFamily: "'SF Mono', Menlo, monospace", color: "var(--shell-link)", fontSize: "0.78rem", textDecoration: "none" }}
                      >
                        {shorten(h.mint)}
                      </Link>
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
    <Link
      href={`/marketplace/assets/${holding.mint}`}
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 16,
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
        display: "block",
        boxShadow: "0 10px 34px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ background: holding.imageUrl ? "#111" : gradient, aspectRatio: "16 / 9", position: "relative", overflow: "hidden" }}>
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
            top: 12,
            left: 12,
            background: "rgba(255,255,255,0.92)",
            padding: "0.2rem 0.6rem",
            borderRadius: 999,
            fontSize: "0.7rem",
            fontWeight: 750,
            color: "var(--shell-fg)",
          }}
        >
          {categoryLabel}
        </div>
        {holding.deliveryRequired ? (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              background: "rgba(37,99,235,0.88)",
              color: "#fff",
              padding: "0.2rem 0.6rem",
              borderRadius: 999,
              fontSize: "0.68rem",
              fontWeight: 750,
            }}
          >
            Physical delivery
          </div>
        ) : null}
      </div>
      <div style={{ padding: "1rem 1.05rem 1.05rem" }}>
        <div style={{ fontSize: "1rem", fontWeight: 760, marginBottom: "0.15rem" }}>
          {holding.name ?? "(unnamed asset)"}
        </div>
        <div style={{ fontSize: "0.74rem", color: "var(--shell-faint)", fontFamily: "'SF Mono', Menlo, monospace", marginBottom: "0.8rem" }}>
          {holding.symbol ?? "—"} · {shorten(holding.mint)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 780, letterSpacing: 0 }}>{holding.amount.toLocaleString()}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--shell-muted)" }}>tokens held</div>
          </div>
          {holding.issuerOwner ? (
            <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", textAlign: "right" }}>
              <div>Issuer</div>
              <div style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>{shorten(holding.issuerOwner)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
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
        <h1 style={{ fontSize: "1.65rem", letterSpacing: 0, marginBottom: "0.3rem", fontWeight: 600 }}>
          Portfolio
        </h1>
        <p style={{ color: "var(--shell-muted)", fontSize: "0.9rem" }}>Tokenised assets held in your wallet.</p>
      </header>
      <div
        style={{
          background: "var(--shell-card)",
          border: "1px solid var(--shell-border)",
          borderRadius: 12,
          padding: "3rem 1.5rem",
          textAlign: "center",
          color: "var(--shell-muted)",
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
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "2.5rem 1.5rem",
        textAlign: "center",
        color: "var(--shell-muted)",
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.82)", border: "1px solid var(--shell-border)", borderRadius: 14, padding: "1rem 1.1rem", boxShadow: "0 8px 26px rgba(15,23,42,0.04)" }}>
      <div style={{ fontSize: "0.72rem", color: "var(--shell-muted)", marginBottom: "0.45rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 780, letterSpacing: 0, color: "var(--shell-fg)" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "var(--shell-faint)", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

const portfolioLinkButton: React.CSSProperties = {
  border: "1px solid var(--shell-border-strong)",
  background: "var(--shell-card)",
  color: "var(--shell-fg)",
  borderRadius: 10,
  padding: "0.62rem 0.85rem",
  fontSize: "0.84rem",
  fontWeight: 750,
  textDecoration: "none",
};
