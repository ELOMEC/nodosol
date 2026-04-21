"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { eventTicketsProgram } from "@/lib/eventTickets";
import {
  buyTicketResaleTx,
  cancelTicketResaleTx,
  fetchAllActiveListings,
  OnChainResaleListing,
} from "@/lib/ticketResale";

type EventIndex = Map<
  string,
  { name: string; symbol: string; creator: string; paymentMint: string; merkleTree: string }
>;

type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      listings: OnChainResaleListing[];
      myListings: OnChainResaleListing[];
      events: EventIndex;
    }
  | { kind: "error"; message: string };

export function ResaleView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [eventFilter, setEventFilter] = useState<string>("");
  const [busyListing, setBusyListing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as unknown as Wallet,
        { commitment: "confirmed" }
      );
      const program = eventTicketsProgram(provider);

      const [listings, events] = await Promise.all([
        fetchAllActiveListings(program),
        (async (): Promise<EventIndex> => {
          const eventsMap: EventIndex = new Map();
          try {
            const api = (program.account as Record<string, {
              all: () => Promise<Array<{
                publicKey: PublicKey;
                account: {
                  creator: PublicKey;
                  name: string;
                  symbol: string;
                  paymentMint: PublicKey;
                  merkleTree: PublicKey;
                };
              }>>;
            }>).event;
            const items = await api.all();
            for (const x of items) {
              eventsMap.set(x.publicKey.toBase58(), {
                name: x.account.name,
                symbol: x.account.symbol,
                creator: x.account.creator.toBase58(),
                paymentMint: x.account.paymentMint.toBase58(),
                merkleTree: x.account.merkleTree.toBase58(),
              });
            }
          } catch {
            // empty index is fine
          }
          return eventsMap;
        })(),
      ]);

      const me = publicKey?.toBase58();
      const mine = me ? listings.filter((l) => l.seller === me) : [];

      setState({
        kind: "ready",
        listings,
        myListings: mine,
        events,
      });
    } catch (err) {
      console.error(err);
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    }
  }, [connection, wallet, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(listing: OnChainResaleListing) {
    if (!publicKey) return;
    if (listing.seller === publicKey.toBase58()) {
      window.alert("You are the seller of this listing.");
      return;
    }
    // We need the assetId — derive from Helius getAssetsByGroup? Or just
    // compute: Bubblegum asset_id = get_asset_id(merkleTree, nonce). The
    // client-side hash formula matches on-chain:
    //   Pubkey::find_program_address([b"asset", merkleTree, nonce], BUBBLEGUM).0
    const assetId = await deriveCnftAssetId(
      new PublicKey(listing.merkleTree),
      BigInt(listing.nonce)
    );
    if (
      !window.confirm(
        `Buy this ticket for $${listing.priceUsdc.toFixed(2)} USDC?\n\nYou'll sign one transaction that sends USDC to the seller and moves the cNFT into your wallet atomically. No trust gap.`
      )
    ) {
      return;
    }
    setBusyListing(listing.address);
    try {
      const sig = await buyTicketResaleTx({
        connection,
        wallet,
        listing,
        assetId,
      });
      window.alert(
        `Swap complete. cNFT is in your wallet. Tx: ${sig.slice(0, 12)}…`
      );
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Buy failed.");
    } finally {
      setBusyListing(null);
    }
  }

  async function cancelMine(listing: OnChainResaleListing) {
    if (!publicKey) return;
    if (!window.confirm("Cancel this listing? The cNFT will return to your wallet.")) return;
    const assetId = await deriveCnftAssetId(
      new PublicKey(listing.merkleTree),
      BigInt(listing.nonce)
    );
    setBusyListing(listing.address);
    try {
      const sig = await cancelTicketResaleTx({
        connection,
        wallet,
        listing,
        assetId,
      });
      window.alert(`Cancelled. Tx: ${sig.slice(0, 12)}…`);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyListing(null);
    }
  }

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [] as OnChainResaleListing[];
    if (!eventFilter) return state.listings;
    return state.listings.filter((l) => l.event === eventFilter);
  }, [state, eventFilter]);

  const eventOptions = useMemo(() => {
    if (state.kind !== "ready") return [] as Array<{ pubkey: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const l of state.listings) counts.set(l.event, (counts.get(l.event) ?? 0) + 1);
    return Array.from(counts.entries()).map(([pubkey, count]) => {
      const meta = state.events.get(pubkey);
      return {
        pubkey,
        count,
        label: meta ? `${meta.name} (${meta.symbol})` : `${pubkey.slice(0, 10)}…`,
      };
    });
  }, [state]);

  return (
    <>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.3rem" }}>
          Resale board
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.88rem", maxWidth: 720 }}>
          Secondary-market listings for Nodosol cNFT tickets. Listings hold the
          cNFT in on-chain escrow; buyers get atomic USDC + cNFT swap in a
          single transaction. No trust gap.
        </p>
      </header>

      {!connected ? (
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Browse anonymously or connect to buy / manage your listings.
            </div>
            <WalletMultiButton />
          </Centered>
        </Card>
      ) : state.kind === "loading" ? (
        <Card><Centered>Loading listings…</Centered></Card>
      ) : state.kind === "error" ? (
        <Card><Centered>Failed: {state.message}</Centered></Card>
      ) : (
        <>
          {state.myListings.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <Card>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.6rem" }}>
                  My active listings
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {state.myListings.map((l) => (
                    <SellerListingRow
                      key={l.address}
                      listing={l}
                      eventMeta={state.events.get(l.event)}
                      busy={busyListing === l.address}
                      onCancel={() => void cancelMine(l)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          )}

          {state.listings.length > 0 && (
            <Card>
              <label style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600, marginRight: "0.5rem" }}>
                Event filter
              </label>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: 6,
                  border: "1px solid var(--shell-border, #eef0f3)",
                  background: "var(--shell-card, #fff)",
                  color: "var(--shell-fg, #111827)",
                  fontSize: "0.82rem",
                }}
              >
                <option value="">All events ({state.listings.length})</option>
                {eventOptions.map((e) => (
                  <option key={e.pubkey} value={e.pubkey}>
                    {e.label} — {e.count}
                  </option>
                ))}
              </select>
            </Card>
          )}

          {visible.length === 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <Card>
                <Centered>
                  <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>No listings yet</div>
                  <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
                    Hold a ticket?{" "}
                    <Link href="/marketplace/tickets" style={{ color: "#4f46e5", fontWeight: 600 }}>
                      Open My tickets
                    </Link>{" "}
                    and use &quot;List for resale&quot; on the detail page.
                  </div>
                </Centered>
              </Card>
            </div>
          ) : (
            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "0.85rem" }}>
              {visible.map((l) => (
                <ListingCard
                  key={l.address}
                  listing={l}
                  eventMeta={state.events.get(l.event)}
                  busy={busyListing === l.address}
                  youAreSeller={publicKey?.toBase58() === l.seller}
                  onBuy={() => void buy(l)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * Compute the Bubblegum asset_id for a leaf.
 *
 * Metaplex derives: [b"asset", tree, nonce_le_bytes] against BUBBLEGUM program.
 */
async function deriveCnftAssetId(tree: PublicKey, nonce: bigint): Promise<string> {
  const BUBBLEGUM = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), tree.toBuffer(), nonceBuf],
    BUBBLEGUM
  );
  return pda.toBase58();
}

function SellerListingRow({
  listing,
  eventMeta,
  busy,
  onCancel,
}: {
  listing: OnChainResaleListing;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 9,
        padding: "0.65rem 0.85rem",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "0.75rem",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>
            {eventMeta ? eventMeta.name : `leaf ${listing.leafIndex}`}
          </span>
          <span
            style={{
              fontSize: "0.62rem",
              padding: "0.1rem 0.45rem",
              borderRadius: 4,
              background: "#10b981",
              color: "#fff",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Escrowed
          </span>
        </div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          ${listing.priceUsdc.toFixed(2)} USDC
          {listing.expiresAt > 0 && (
            <> · expires {new Date(listing.expiresAt * 1000).toLocaleString()}</>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "0.4rem 0.8rem",
            borderRadius: 6,
            border: "1px solid #fecaca",
            background: "transparent",
            color: "#b91c1c",
            fontSize: "0.76rem",
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "…" : "Cancel · return cNFT"}
        </button>
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  eventMeta,
  busy,
  youAreSeller,
  onBuy,
}: {
  listing: OnChainResaleListing;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  youAreSeller: boolean;
  onBuy: () => void;
}) {
  const expired = listing.expiresAt > 0 && listing.expiresAt * 1000 < Date.now();
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "0.95rem 1.1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>
            {eventMeta ? eventMeta.name : `leaf ${listing.leafIndex}`}
          </div>
          {eventMeta && (
            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
              {eventMeta.symbol}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>${listing.priceUsdc.toFixed(2)}</div>
          <div style={{ fontSize: "0.62rem", color: "#9ca3af" }}>USDC</div>
        </div>
      </div>
      <div style={{ fontSize: "0.7rem", color: "#6b7280", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <span>
          Seller <code style={{ color: "#9ca3af" }}>{listing.seller.slice(0, 6)}…{listing.seller.slice(-4)}</code>
        </span>
        {listing.expiresAt > 0 && (
          <span style={{ color: expired ? "#b91c1c" : undefined }}>
            {expired ? "Expired" : `Expires ${new Date(listing.expiresAt * 1000).toLocaleString()}`}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
        <button
          type="button"
          onClick={onBuy}
          disabled={busy || youAreSeller || expired}
          title={
            youAreSeller
              ? "You are the seller"
              : expired
              ? "Listing expired"
              : "Atomic USDC + cNFT swap"
          }
          style={{
            padding: "0.45rem 1rem",
            borderRadius: 7,
            border: "none",
            background: busy || youAreSeller || expired ? "#c7d2fe" : "#4f46e5",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: busy || youAreSeller || expired ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Swapping…" : youAreSeller ? "Your listing" : "Buy · atomic swap"}
        </button>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 12,
        padding: "1rem 1.2rem",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}
