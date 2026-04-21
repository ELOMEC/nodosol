"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { USDC_UNIT } from "@/lib/constants";
import { eventTicketsProgram } from "@/lib/eventTickets";
import { getAsset } from "@/lib/helius";
import {
  cancelListing,
  listActiveListings,
  listListingsForSeller,
  markListingSold,
  markListingSoldPending,
  TicketListingDoc,
} from "@/lib/ticketListings";

type EventIndex = Map<
  string,
  { name: string; symbol: string; creator: string; paymentMint: string }
>;

type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      listings: TicketListingDoc[];
      myListings: TicketListingDoc[];
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
      const [listings, myListings] = await Promise.all([
        listActiveListings({ limit: 200 }),
        publicKey ? listListingsForSeller(publicKey.toBase58()) : Promise.resolve([]),
      ]);
      const events: EventIndex = new Map();
      const anyListings = listings.length > 0 || myListings.length > 0;
      if (anyListings) {
        try {
          const provider = new AnchorProvider(
            connection,
            wallet as unknown as Wallet,
            { commitment: "confirmed" }
          );
          const program = eventTicketsProgram(provider);
          const api = (program.account as Record<string, {
            all: () => Promise<Array<{
              publicKey: PublicKey;
              account: {
                creator: PublicKey;
                name: string;
                symbol: string;
                paymentMint: PublicKey;
              };
            }>>;
          }>).event;
          const items = await api.all();
          for (const x of items) {
            events.set(x.publicKey.toBase58(), {
              name: x.account.name,
              symbol: x.account.symbol,
              creator: x.account.creator.toBase58(),
              paymentMint: x.account.paymentMint.toBase58(),
            });
          }
        } catch {
          // event index remains empty — listings still render with pubkeys
        }
      }
      setState({ kind: "ready", listings, myListings, events });
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

  async function payForListing(listing: TicketListingDoc) {
    if (!publicKey || state.kind !== "ready") return;
    const eventMeta = state.events.get(listing.eventPubkey);
    if (!eventMeta) {
      window.alert("Could not resolve the event's payment mint — refresh and try again.");
      return;
    }
    if (listing.sellerPubkey === publicKey.toBase58()) {
      window.alert("You are the seller of this listing.");
      return;
    }
    if (
      !window.confirm(
        `Send $${(listing.priceUsdcBase / USDC_UNIT).toFixed(2)} USDC to ${listing.sellerPubkey.slice(0, 6)}…${listing.sellerPubkey.slice(-4)}?\n\nThe seller will then transfer the cNFT ticket to your wallet. This is an honor-system swap for V0 — atomic settlement is coming.`
      )
    ) {
      return;
    }
    setBusyListing(listing.id);
    try {
      const paymentMint = new PublicKey(eventMeta.paymentMint);
      const seller = new PublicKey(listing.sellerPubkey);
      const mintInfo = await getMint(connection, paymentMint, "confirmed", TOKEN_2022_PROGRAM_ID);
      const decimals = mintInfo.decimals;

      const buyerAta = getAssociatedTokenAddressSync(
        paymentMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const sellerAta = getAssociatedTokenAddressSync(
        paymentMint,
        seller,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const ixs = [];

      // Ensure seller's ATA exists — pay buyer creates it if missing.
      const sellerAtaInfo = await connection.getAccountInfo(sellerAta);
      if (!sellerAtaInfo) {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            publicKey,
            sellerAta,
            seller,
            paymentMint,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      ixs.push(
        createTransferCheckedInstruction(
          buyerAta,
          paymentMint,
          sellerAta,
          publicKey,
          BigInt(listing.priceUsdcBase),
          decimals,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
      for (const ix of ixs) tx.add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      await markListingSoldPending({
        id: listing.id,
        buyerPubkey: publicKey.toBase58(),
        paymentSig: sig,
      });

      // Sanity-check the seller still owns the cNFT at payment time — if not,
      // we surface a warning but the payment has landed.
      try {
        const asset = await getAsset(listing.assetId);
        if (asset && asset.ownership?.owner && asset.ownership.owner !== listing.sellerPubkey) {
          window.alert(
            `Paid ${listing.priceUsdcBase / USDC_UNIT} USDC, but the cNFT is no longer owned by ${listing.sellerPubkey.slice(0, 6)}… — contact seller.`
          );
        } else {
          window.alert(
            `Paid. Seller must now transfer the cNFT to your wallet in Phantom. Tx: ${sig.slice(0, 12)}…`
          );
        }
      } catch {
        window.alert(`Paid. Tx: ${sig.slice(0, 12)}…`);
      }

      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setBusyListing(null);
    }
  }

  async function markTransferred(listing: TicketListingDoc) {
    if (!publicKey) return;
    const sig = window.prompt(
      "Paste the cNFT transfer tx signature (optional — leave blank if you don't have one):",
      ""
    );
    setBusyListing(listing.id);
    try {
      await markListingSold({
        id: listing.id,
        sellerPubkey: publicKey.toBase58(),
        transferSig: sig ? sig.trim() : null,
      });
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Mark failed");
    } finally {
      setBusyListing(null);
    }
  }

  async function cancelMyListing(listing: TicketListingDoc) {
    if (!publicKey) return;
    if (!window.confirm("Cancel this listing?")) return;
    setBusyListing(listing.id);
    try {
      await cancelListing(listing.id, publicKey.toBase58());
      await load();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusyListing(null);
    }
  }

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [] as TicketListingDoc[];
    if (!eventFilter) return state.listings;
    return state.listings.filter((l) => l.eventPubkey === eventFilter);
  }, [state, eventFilter]);

  const eventOptions = useMemo(() => {
    if (state.kind !== "ready") return [] as Array<{ pubkey: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const l of state.listings) counts.set(l.eventPubkey, (counts.get(l.eventPubkey) ?? 0) + 1);
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
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.3rem" }}>
            Resale board
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", maxWidth: 720 }}>
            Secondary-market listings for Nodosol cNFT tickets. Prices are set by
            sellers. Paying sends USDC from your wallet to theirs; the seller then
            transfers the cNFT in Phantom. Atomic on-chain settlement is coming
            in the next program upgrade.
          </p>
        </div>
      </header>

      {!connected ? (
        <Card>
          <Centered>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Connect wallet</div>
            <div style={{ fontSize: "0.88rem", color: "#6b7280", marginBottom: "1rem" }}>
              Browse listings anonymously or connect to pay a seller directly.
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
          {state.myListings.filter(
            (l) => l.settlementStatus === "listed" || l.settlementStatus === "sold_pending"
          ).length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <Card>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.6rem" }}>
                  My listings
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {state.myListings
                    .filter(
                      (l) =>
                        l.settlementStatus === "listed" ||
                        l.settlementStatus === "sold_pending"
                    )
                    .map((l) => (
                      <SellerListingRow
                        key={l.id}
                        listing={l}
                        eventMeta={state.events.get(l.eventPubkey)}
                        busy={busyListing === l.id}
                        onMarkTransferred={() => void markTransferred(l)}
                        onCancel={() => void cancelMyListing(l)}
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
                  key={l.id}
                  listing={l}
                  eventMeta={state.events.get(l.eventPubkey)}
                  busy={busyListing === l.id}
                  youAreSeller={publicKey?.toBase58() === l.sellerPubkey}
                  onPay={() => void payForListing(l)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ListingCard({
  listing,
  eventMeta,
  busy,
  youAreSeller,
  onPay,
}: {
  listing: TicketListingDoc;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  youAreSeller: boolean;
  onPay: () => void;
}) {
  const priceUsdc = listing.priceUsdcBase / USDC_UNIT;
  const expired = listing.expiresAt
    ? new Date(listing.expiresAt).getTime() < Date.now()
    : false;
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
            {eventMeta ? eventMeta.name : "Unknown event"}
          </div>
          {eventMeta && (
            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
              {eventMeta.symbol}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>${priceUsdc.toFixed(2)}</div>
          <div style={{ fontSize: "0.62rem", color: "#9ca3af" }}>USDC</div>
        </div>
      </div>
      {listing.note && (
        <div style={{ fontSize: "0.78rem", color: "#4b5563", fontStyle: "italic" }}>
          “{listing.note}”
        </div>
      )}
      <div style={{ fontSize: "0.7rem", color: "#6b7280", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <span>
          Seller <code style={{ color: "#9ca3af" }}>{listing.sellerPubkey.slice(0, 6)}…{listing.sellerPubkey.slice(-4)}</code>
        </span>
        {listing.expiresAt && (
          <span style={{ color: expired ? "#b91c1c" : undefined }}>
            {expired ? "Expired" : `Expires ${new Date(listing.expiresAt).toLocaleString()}`}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
        <Link
          href={`/marketplace/tickets/${listing.assetId}`}
          style={{
            padding: "0.45rem 0.85rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-pill-bg, #f7f8fa)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.78rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Ticket details
        </Link>
        <button
          type="button"
          onClick={onPay}
          disabled={busy || youAreSeller || expired}
          title={
            youAreSeller
              ? "You are the seller"
              : expired
              ? "Listing expired"
              : "Pay the seller in USDC"
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
          {busy ? "Paying…" : youAreSeller ? "Your listing" : "Buy (send USDC)"}
        </button>
      </div>
    </div>
  );
}

function SellerListingRow({
  listing,
  eventMeta,
  busy,
  onMarkTransferred,
  onCancel,
}: {
  listing: TicketListingDoc;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  onMarkTransferred: () => void;
  onCancel: () => void;
}) {
  const priceUsdc = listing.priceUsdcBase / USDC_UNIT;
  const pending = listing.settlementStatus === "sold_pending";
  return (
    <div
      style={{
        border: `1px solid ${pending ? "#f59e0b" : "var(--shell-border, #eef0f3)"}`,
        background: pending ? "#fffbeb" : "var(--shell-card, #fff)",
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
            {eventMeta ? eventMeta.name : `Asset ${listing.assetId.slice(0, 8)}…`}
          </span>
          <span
            style={{
              fontSize: "0.62rem",
              padding: "0.1rem 0.45rem",
              borderRadius: 4,
              background: pending ? "#f59e0b" : "#e0e7ff",
              color: pending ? "#fff" : "#3730a3",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {pending ? "Paid — transfer pending" : "Listed"}
          </span>
        </div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>
          ${priceUsdc.toFixed(2)} USDC
          {listing.buyerPubkey && (
            <>
              {" · "}
              Buyer{" "}
              <code style={{ color: "#9ca3af" }}>
                {listing.buyerPubkey.slice(0, 6)}…{listing.buyerPubkey.slice(-4)}
              </code>
            </>
          )}
          {listing.paymentSig && (
            <>
              {" · "}
              <a
                href={`https://explorer.solana.com/tx/${listing.paymentSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#4338ca", textDecoration: "none" }}
              >
                payment tx ↗
              </a>
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <Link
          href={`/marketplace/tickets/${listing.assetId}`}
          style={{
            padding: "0.4rem 0.7rem",
            borderRadius: 6,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-pill-bg, #f7f8fa)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.74rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Ticket
        </Link>
        {pending ? (
          <button
            type="button"
            onClick={onMarkTransferred}
            disabled={busy}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 6,
              border: "none",
              background: busy ? "#c7d2fe" : "#4f46e5",
              color: "#fff",
              fontSize: "0.76rem",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "…" : "Mark transferred"}
          </button>
        ) : (
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
            Cancel
          </button>
        )}
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
