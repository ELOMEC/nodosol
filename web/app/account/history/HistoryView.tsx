"use client";

import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import auctionsIdl from "@/idl/auctions.json";
import otcIdl from "@/idl/otc_deals.json";

import { USDC_UNIT } from "@/lib/constants";
import { HeliusAsset, getAssetsByOwner } from "@/lib/helius";
import { subscriptionProgram } from "@/lib/programs";

// ---- Anchor account layouts ----------------------------------------------
//
// Discriminator (8 bytes) precedes every Anchor account.
// Subscription: plan(32) | subscriber(32) | startedAt(8) | ...
//   subscriber memcmp offset = 8 + 32 = 40
// Deal:         seller(32) | buyer(32) | ...
//   seller memcmp offset = 8
//   buyer memcmp offset = 40
// Auction:      seller(32) | auction_id(8) | payment_mint(32) | vault(32)
//             | start_price(8) | min_deposit(8) | created_at(8)
//             | commit_ends_at(8) | reveal_ends_at(8) | status(1)
//             | bid_count(4) | revealed_count(4) | highest_bid(8)
//             | highest_bidder(32)
//   highest_bidder offset = 8 + 32 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 4 + 4 + 8 = 169

const SUBSCRIBER_OFFSET = 40;
const DEAL_SELLER_OFFSET = 8;
const DEAL_BUYER_OFFSET = 40;
const AUCTION_HIGHEST_BIDDER_OFFSET = 169;

type RawSubscription = {
  publicKey: { toBase58(): string };
  account: {
    plan: { toBase58(): string };
    subscriber: { toBase58(): string };
    startedAt: BN;
    nextChargeAt: BN;
    chargeCount: BN;
    totalPaid: BN;
    status: Record<string, unknown>;
  };
};

type RawDeal = {
  publicKey: { toBase58(): string };
  account: {
    seller: { toBase58(): string };
    buyer: { toBase58(): string };
    assetMint: { toBase58(): string };
    paymentMint: { toBase58(): string };
    dealId: BN;
    quantity: BN;
    totalPrice: BN;
    status: Record<string, unknown>;
    expiresAt: BN;
    createdAt: BN;
    updatedAt: BN;
  };
};

type RawAuction = {
  publicKey: { toBase58(): string };
  account: {
    seller: { toBase58(): string };
    auctionId: BN;
    startPrice: BN;
    highestBid: BN;
    revealEndsAt: BN;
    settledAt: BN;
    highestBidder: { toBase58(): string };
    status: Record<string, unknown>;
  };
};

type Snapshot = {
  tickets: HeliusAsset[];
  subscriptions: RawSubscription[];
  dealsAsBuyer: RawDeal[];
  dealsAsSeller: RawDeal[];
  auctionWins: RawAuction[];
  ticketsError: string | null;
};

function bnToNumber(value?: BN): number {
  if (!value) return 0;
  return Number(value.toString());
}

function statusLabel(status: Record<string, unknown>): string {
  if (!status || typeof status !== "object") return "—";
  const k = Object.keys(status)[0];
  if (!k) return "—";
  return k.replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

function shortPubkey(p: string): string {
  return p.length > 10 ? `${p.slice(0, 4)}…${p.slice(-4)}` : p;
}

function formatDate(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleDateString();
}

function formatUsdc(raw: BN | undefined): string {
  return (bnToNumber(raw) / USDC_UNIT).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function HistoryView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const sub = subscriptionProgram(provider);
      const otc = new Program(otcIdl as never, provider);
      const auc = new Program(auctionsIdl as never, provider);

      const walletStr = publicKey.toBase58();
      type AccApi<T> = {
        all: (filters?: ReadonlyArray<{ memcmp: { offset: number; bytes: string } }>) => Promise<T[]>;
      };

      const subApi = (sub.account as Record<string, unknown>).subscription as
        | AccApi<RawSubscription>
        | undefined;
      const dealApi = (otc.account as Record<string, unknown>).deal as
        | AccApi<RawDeal>
        | undefined;
      const aucApi = (auc.account as Record<string, unknown>).auction as
        | AccApi<RawAuction>
        | undefined;

      const memcmp = (offset: number) => [
        { memcmp: { offset, bytes: walletStr } },
      ] as const;

      const [subscriptions, dealsAsBuyer, dealsAsSeller, auctionWins, tickets] =
        await Promise.all([
          subApi ? subApi.all(memcmp(SUBSCRIBER_OFFSET)) : Promise.resolve([] as RawSubscription[]),
          dealApi ? dealApi.all(memcmp(DEAL_BUYER_OFFSET)) : Promise.resolve([] as RawDeal[]),
          dealApi ? dealApi.all(memcmp(DEAL_SELLER_OFFSET)) : Promise.resolve([] as RawDeal[]),
          aucApi ? aucApi.all(memcmp(AUCTION_HIGHEST_BIDDER_OFFSET)) : Promise.resolve([] as RawAuction[]),
          fetchOwnedTickets(walletStr),
        ]);

      setSnap({
        subscriptions: subscriptions.sort(
          (a, b) => bnToNumber(b.account.startedAt) - bnToNumber(a.account.startedAt),
        ),
        dealsAsBuyer: dealsAsBuyer.sort(
          (a, b) => bnToNumber(b.account.updatedAt) - bnToNumber(a.account.updatedAt),
        ),
        dealsAsSeller: dealsAsSeller.sort(
          (a, b) => bnToNumber(b.account.updatedAt) - bnToNumber(a.account.updatedAt),
        ),
        auctionWins: auctionWins.sort(
          (a, b) => bnToNumber(b.account.settledAt) - bnToNumber(a.account.settledAt),
        ),
        tickets: tickets.assets,
        ticketsError: tickets.error,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setBusy(false);
    }
  }, [publicKey, connection, wallet]);

  useEffect(() => {
    if (connected && publicKey) void reload();
    else setSnap(null);
  }, [connected, publicKey, reload]);

  if (!connected || !publicKey) {
    return (
      <div style={{ padding: "2rem 0", maxWidth: 560 }}>
        <h1 style={H1}>Purchase history</h1>
        <p style={SUB}>
          Connect a wallet to see your tickets, subscriptions, OTC deals,
          and auction wins.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={HEADER}>
        <div>
          <h1 style={H1}>Purchase history</h1>
          <p style={SUB}>
            Everything you bought, subscribed to, or won across Nodosol
            programs — fetched live from devnet.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={busy} style={BTN}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error ? <p style={ERROR}>{error}</p> : null}

      {!snap ? (
        <p style={SUB}>{busy ? "Loading…" : ""}</p>
      ) : (
        <>
          <Section
            title="Tickets"
            empty="No tickets yet."
            note={snap.ticketsError ? `Helius lookup: ${snap.ticketsError}` : undefined}
          >
            {snap.tickets.length > 0 && (
              <ul style={LIST}>
                {snap.tickets.slice(0, 30).map((t) => {
                  const meta = t.content?.metadata;
                  return (
                    <li key={t.id} style={ROW}>
                      <div style={ROW_PRIMARY}>{meta?.name ?? "Untitled asset"}</div>
                      <div style={ROW_META}>
                        {meta?.symbol ? `${meta.symbol} · ` : ""}
                        <code style={MONO}>{shortPubkey(t.id)}</code>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Subscriptions" empty="No active or past subscriptions.">
            {snap.subscriptions.length > 0 && (
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Plan</th>
                    <th style={TH}>Status</th>
                    <th style={{ ...TH, textAlign: "right" }}>Charges</th>
                    <th style={{ ...TH, textAlign: "right" }}>Total paid</th>
                    <th style={TH}>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.subscriptions.map((s) => (
                    <tr key={s.publicKey.toBase58()}>
                      <td style={TD}>
                        <code style={MONO}>{shortPubkey(s.account.plan.toBase58())}</code>
                      </td>
                      <td style={TD}>{statusLabel(s.account.status)}</td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        {bnToNumber(s.account.chargeCount)}
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        ${formatUsdc(s.account.totalPaid)}
                      </td>
                      <td style={TD}>{formatDate(bnToNumber(s.account.startedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="OTC deals" empty="No OTC deals.">
            {(snap.dealsAsBuyer.length > 0 || snap.dealsAsSeller.length > 0) && (
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Side</th>
                    <th style={TH}>Counterparty</th>
                    <th style={{ ...TH, textAlign: "right" }}>Qty</th>
                    <th style={{ ...TH, textAlign: "right" }}>Price</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...snap.dealsAsBuyer.map((d) => ({ d, side: "buy" as const })),
                    ...snap.dealsAsSeller.map((d) => ({ d, side: "sell" as const })),
                  ]
                    .sort(
                      (a, b) =>
                        bnToNumber(b.d.account.updatedAt) - bnToNumber(a.d.account.updatedAt),
                    )
                    .map(({ d, side }) => {
                      const cp =
                        side === "buy"
                          ? d.account.seller.toBase58()
                          : d.account.buyer.toBase58();
                      return (
                        <tr key={`${side}-${d.publicKey.toBase58()}`}>
                          <td style={TD}>{side}</td>
                          <td style={TD}>
                            <code style={MONO}>{shortPubkey(cp)}</code>
                          </td>
                          <td style={{ ...TD, textAlign: "right" }}>
                            {bnToNumber(d.account.quantity)}
                          </td>
                          <td style={{ ...TD, textAlign: "right" }}>
                            ${formatUsdc(d.account.totalPrice)}
                          </td>
                          <td style={TD}>{statusLabel(d.account.status)}</td>
                          <td style={TD}>{formatDate(bnToNumber(d.account.updatedAt))}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Auction wins" empty="No auctions won.">
            {snap.auctionWins.length > 0 && (
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Auction</th>
                    <th style={TH}>Seller</th>
                    <th style={{ ...TH, textAlign: "right" }}>Winning bid</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Reveal ended</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.auctionWins.map((a) => (
                    <tr key={a.publicKey.toBase58()}>
                      <td style={TD}>
                        <Link
                          href={`/marketplace/auctions/${a.publicKey.toBase58()}`}
                          style={LINK}
                        >
                          {shortPubkey(a.publicKey.toBase58())}
                        </Link>
                      </td>
                      <td style={TD}>
                        <code style={MONO}>{shortPubkey(a.account.seller.toBase58())}</code>
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        ${formatUsdc(a.account.highestBid)}
                      </td>
                      <td style={TD}>{statusLabel(a.account.status)}</td>
                      <td style={TD}>{formatDate(bnToNumber(a.account.revealEndsAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

async function fetchOwnedTickets(
  walletStr: string,
): Promise<{ assets: HeliusAsset[]; error: string | null }> {
  try {
    const assets = await getAssetsByOwner(walletStr);
    return { assets, error: null };
  } catch (err) {
    return {
      assets: [],
      error:
        err instanceof Error
          ? err.message
          : "Helius DAS unavailable (set NEXT_PUBLIC_HELIUS_API_KEY for full tickets)",
    };
  }
}

function Section({
  title,
  empty,
  note,
  children,
}: {
  title: string;
  empty: string;
  note?: string;
  children?: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : children ? [children] : [];
  const hasContent = arr.some((c) => c !== false && c !== null && c !== undefined);
  return (
    <section style={CARD}>
      <header style={CARD_HEAD}>
        <h2 style={H2}>{title}</h2>
        {note ? <span style={CARD_HINT}>{note}</span> : null}
      </header>
      {hasContent ? children : <p style={CARD_SUB}>{empty}</p>}
    </section>
  );
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
  maxWidth: 600,
};

const ERROR: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.85rem",
  marginBottom: "1rem",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  padding: "1.1rem 1.2rem",
  marginBottom: "1.1rem",
  background: "var(--shell-card-bg)",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "0.85rem",
  marginBottom: "0.75rem",
};

const CARD_HINT: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--shell-faint)",
};

const CARD_SUB: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--shell-muted)",
};

const H2: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "var(--shell-fg)",
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
  padding: "0.4rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
};

const TD: React.CSSProperties = {
  padding: "0.45rem 0.5rem",
  borderBottom: "1px solid var(--shell-divider)",
  color: "var(--shell-fg)",
};

const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8rem",
};

const LIST: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const ROW: React.CSSProperties = {
  borderBottom: "1px solid var(--shell-divider)",
  paddingBottom: "0.4rem",
};

const ROW_PRIMARY: React.CSSProperties = {
  fontWeight: 500,
  fontSize: "0.88rem",
  color: "var(--shell-fg)",
};

const ROW_META: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--shell-muted)",
  marginTop: "0.15rem",
};

const BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--shell-muted)",
  border: "1px solid var(--shell-border)",
  borderRadius: 8,
  padding: "0.5rem 1rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};
