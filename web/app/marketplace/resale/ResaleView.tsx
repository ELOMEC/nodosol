"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { eventTicketsProgram } from "@/lib/eventTickets";
import { USDC_UNIT } from "@/lib/constants";
import {
  buyTicketResalePrivateTx,
  buyTicketResaleTx,
  cancelTicketResaleTx,
  closeExpiredResaleTx,
  decodePriceEnvelope,
  fetchAllActiveListings,
  OnChainResaleListing,
} from "@/lib/ticketResale";
import { explainSolanaError } from "@/lib/solanaErrors";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/ToastProvider";
import { MarketSearchBar } from "@/components/MarketSearchBar";

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
  const [privateBuyModal, setPrivateBuyModal] = useState<OnChainResaleListing | null>(null);
  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortKey, setSortKey] = useState<"newest" | "expiring_soon" | "price_asc" | "price_desc">("newest");
  const toast = useToast();

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
    if (listing.isPrivate) {
      setPrivateBuyModal(listing);
      return;
    }
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
      console.log("Buy tx:", sig);
      toast.success("Ticket bought");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyListing(null);
    }
  }

  async function buyPrivate(listing: OnChainResaleListing, envelope: string) {
    if (!publicKey) return;
    const parsed = decodePriceEnvelope(envelope);
    if (!parsed) {
      window.alert("That doesn't look like a valid envelope.");
      return;
    }
    const assetId = await deriveCnftAssetId(
      new PublicKey(listing.merkleTree),
      BigInt(listing.nonce)
    );
    setBusyListing(listing.address);
    try {
      const sig = await buyTicketResalePrivateTx({
        connection,
        wallet,
        listing,
        assetId,
        priceBase: parsed.priceBase,
        nonce: parsed.nonce,
      });
      console.log("Private buy tx:", sig);
      toast.success("Ticket bought");
      setPrivateBuyModal(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyListing(null);
    }
  }

  async function reclaimExpired(listing: OnChainResaleListing) {
    if (!publicKey) return;
    if (
      !window.confirm(
        "Reclaim this expired listing? The cNFT and rent will be returned to the original seller. You (the caller) only pay the tx fee."
      )
    ) {
      return;
    }
    const assetId = await deriveCnftAssetId(
      new PublicKey(listing.merkleTree),
      BigInt(listing.nonce)
    );
    setBusyListing(listing.address);
    try {
      const sig = await closeExpiredResaleTx({
        connection,
        wallet,
        listing,
        assetId,
      });
      console.log("Reclaim tx:", sig);
      toast.success("Reclaimed");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
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
      console.log("Cancel tx:", sig);
      toast.success("Cancelled");
      await load();
    } catch (err) {
      console.error(err);
      toast.error(explainSolanaError(err));
    } finally {
      setBusyListing(null);
    }
  }

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [] as OnChainResaleListing[];
    const q = search.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    return state.listings
      .filter((l) => (eventFilter ? l.event === eventFilter : true))
      .filter((l) => {
        if (q) {
          const meta = state.events.get(l.event);
          const eventName = meta?.name?.toLowerCase() ?? "";
          const sym = meta?.symbol?.toLowerCase() ?? "";
          if (!eventName.includes(q) && !sym.includes(q) && !l.seller.toLowerCase().includes(q)) return false;
        }
        if (!l.isPrivate) {
          if (min !== null && !Number.isNaN(min) && l.priceUsdc < min) return false;
          if (max !== null && !Number.isNaN(max) && l.priceUsdc > max) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "newest":
            return b.createdAt - a.createdAt;
          case "expiring_soon":
            return a.expiresAt - b.expiresAt;
          case "price_asc":
            return (a.isPrivate ? Number.MAX_SAFE_INTEGER : a.priceUsdc) - (b.isPrivate ? Number.MAX_SAFE_INTEGER : b.priceUsdc);
          case "price_desc":
            return (b.isPrivate ? -1 : b.priceUsdc) - (a.isPrivate ? -1 : a.priceUsdc);
        }
      });
  }, [state, eventFilter, search, priceMin, priceMax, sortKey]);

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
      <header style={HERO}>
        <span style={EYEBROW}>Secondary ticket market</span>
        <h1 style={H1}>
          Resale board
        </h1>
        <p style={SUB}>
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
            <>
              <Card>
                <label style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600, marginRight: "0.5rem" }}>
                  Event filter
                </label>
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  style={{
                    padding: "0.62rem 0.75rem",
                    borderRadius: 999,
                    border: "1px solid var(--shell-border, #eef0f3)",
                    background: "#fff",
                    color: "var(--shell-fg, #111827)",
                    fontSize: "0.82rem",
                    fontWeight: 800,
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

              <MarketSearchBar
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search by event name, symbol, or seller…"
                priceMin={priceMin}
                priceMax={priceMax}
                onPriceMin={setPriceMin}
                onPriceMax={setPriceMax}
                priceLabel="Resale price"
                sortKey={sortKey}
                onSort={setSortKey}
                sortOptions={[
                  { value: "newest", label: "Sort: Newest" },
                  { value: "expiring_soon", label: "Sort: Expiring soon" },
                  { value: "price_asc", label: "Sort: Price ↑" },
                  { value: "price_desc", label: "Sort: Price ↓" },
                ]}
                filteredCount={visible.length}
                totalCount={state.listings.length}
                countLabel="listings"
              />
            </>
          )}

          {visible.length === 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <Card>
                <EmptyState
                  icon="resale"
                  title="No resale listings yet"
                  description={
                    <>
                      Hold a ticket? Open it from <strong>My tickets</strong> and tap
                      &ldquo;List for resale&rdquo; — atomic on-chain swap with optional
                      private-price commit/reveal.
                    </>
                  }
                  actions={[
                    { label: "Open My tickets", href: "/marketplace/tickets", variant: "primary" },
                    { label: "Browse events", href: "/marketplace/events", variant: "secondary" },
                  ]}
                />
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
                  onReclaimExpired={() => void reclaimExpired(l)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {privateBuyModal && (
        <PrivateBuyModal
          listing={privateBuyModal}
          eventMeta={state.kind === "ready" ? state.events.get(privateBuyModal.event) : undefined}
          busy={busyListing === privateBuyModal.address}
          onCancel={() => {
            if (busyListing === null) setPrivateBuyModal(null);
          }}
          onSubmit={(envelope) => void buyPrivate(privateBuyModal, envelope)}
        />
      )}
    </>
  );
}

function PrivateBuyModal({
  listing,
  eventMeta,
  busy,
  onCancel,
  onSubmit,
}: {
  listing: OnChainResaleListing;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (envelope: string) => void;
}) {
  const [env, setEnv] = useState("");
  const [parsed, setParsed] = useState<{ priceBase: bigint; nonce: Uint8Array } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onEnvChange(v: string) {
    setEnv(v);
    setErr(null);
    const p = decodePriceEnvelope(v.trim());
    setParsed(p);
  }

  function handleSubmit() {
    const trimmed = env.trim();
    if (!trimmed) {
      setErr("Paste the envelope first.");
      return;
    }
    if (!parsed) {
      setErr("Envelope doesn't decode — double-check with the seller.");
      return;
    }
    onSubmit(trimmed);
  }

  const priceUsdc = parsed ? Number(parsed.priceBase) / USDC_UNIT : null;

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 150,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--shell-card, #fff)",
          color: "var(--shell-fg, #111827)",
          borderRadius: 14,
          width: 540,
          maxWidth: "100%",
          padding: "1.2rem 1.4rem",
          boxShadow: "0 18px 48px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>
            Buy {eventMeta ? `— ${eventMeta.name}` : "private listing"}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.2rem" }}>
            This listing has a private price. Paste the envelope the seller
            shared with you (looks like <code>AQAAAAAAAAAxMjM…</code>). The
            price stays hidden until you sign the buy tx.
          </div>
        </div>

        <label
          style={{
            fontSize: "0.72rem",
            color: "#6b7280",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Envelope
        </label>
        <textarea
          rows={3}
          value={env}
          onChange={(e) => onEnvChange(e.target.value)}
          placeholder="Paste the whole envelope string here"
          style={{
            padding: "0.55rem 0.7rem",
            borderRadius: 7,
            border: "1px solid var(--shell-border, #eef0f3)",
            background: "var(--shell-card, #fff)",
            color: "var(--shell-fg, #111827)",
            fontSize: "0.82rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            resize: "vertical",
            minHeight: 64,
          }}
        />

        {priceUsdc !== null ? (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              borderRadius: 8,
              background: "#eef2ff",
              color: "#3730a3",
              fontSize: "0.85rem",
            }}
          >
            Envelope decodes to <strong>${priceUsdc.toFixed(2)} USDC</strong>.
            On submit, the program verifies this matches the seller&apos;s
            on-chain commit, then settles atomically.
          </div>
        ) : (
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Waiting for a valid envelope…
          </div>
        )}

        {err && <div style={{ fontSize: "0.78rem", color: "#b91c1c" }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.45rem" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 7,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: "var(--shell-card, #fff)",
              color: "var(--shell-fg, #111827)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !parsed}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: 7,
              border: "none",
              background: busy || !parsed ? "#c7d2fe" : "#4f46e5",
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: busy || !parsed ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Swapping…" : "Buy · atomic swap"}
          </button>
        </div>
      </div>
    </div>
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
  onReclaimExpired,
}: {
  listing: OnChainResaleListing;
  eventMeta: { name: string; symbol: string } | undefined;
  busy: boolean;
  youAreSeller: boolean;
  onBuy: () => void;
  onReclaimExpired: () => void;
}) {
  const expired = listing.expiresAt > 0 && listing.expiresAt * 1000 < Date.now();
  return (
    <div
      style={{
        background: "var(--shell-card, #fff)",
        border: "1px solid var(--shell-border, #eef0f3)",
        borderRadius: 16,
        padding: "1.05rem 1.1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.55rem",
        boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.92rem", fontWeight: 800 }}>
            {eventMeta ? eventMeta.name : `leaf ${listing.leafIndex}`}
          </div>
          {eventMeta && (
            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
              {eventMeta.symbol}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          {listing.isPrivate ? (
            <>
              <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#0369a1" }}>Private</div>
              <div style={{ fontSize: "0.62rem", color: "#9ca3af" }}>needs envelope</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>${listing.priceUsdc.toFixed(2)}</div>
              <div style={{ fontSize: "0.62rem", color: "#9ca3af" }}>USDC</div>
            </>
          )}
        </div>
      </div>
      {listing.isPrivate && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "#3730a3",
            background: "#eef2ff",
            padding: "0.35rem 0.55rem",
            borderRadius: 12,
          }}
        >
          Seller committed to a private price. Only someone with the envelope
          can buy.
        </div>
      )}
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
        {expired ? (
          <button
            type="button"
            onClick={onReclaimExpired}
            disabled={busy}
            title="Permissionless: returns the cNFT + rent to the seller"
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 999,
              border: "1px solid var(--shell-border, #eef0f3)",
              background: busy ? "#e0e7ff" : "var(--shell-pill-bg, #f7f8fa)",
              color: "var(--shell-fg, #111827)",
              fontSize: "0.8rem",
              fontWeight: 800,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Reclaiming…" : "Reclaim for seller"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={busy || youAreSeller}
            title={
              youAreSeller
                ? "You are the seller"
                : "Atomic USDC + cNFT swap"
            }
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 999,
              border: busy || youAreSeller ? "1px solid #cbd5e1" : "1px solid #0f172a",
              background: busy || youAreSeller ? "#cbd5e1" : "#0f172a",
              color: "#fff",
              fontSize: "0.8rem",
              fontWeight: 800,
              cursor: busy || youAreSeller ? "not-allowed" : "pointer",
            }}
          >
            {busy
              ? "Swapping…"
              : youAreSeller
              ? "Your listing"
              : listing.isPrivate
              ? "Buy with envelope"
              : "Buy · atomic swap"}
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
        borderRadius: 16,
        padding: "1rem 1.2rem",
        boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
      }}
    >
      {children}
    </div>
  );
}

const HERO: React.CSSProperties = {
  marginBottom: "1rem",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 22,
  padding: "1.35rem",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,247,237,0.82))",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
};

const EYEBROW: React.CSSProperties = {
  display: "inline-flex",
  marginBottom: "0.55rem",
  color: "#c2410c",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const H1: React.CSSProperties = {
  fontSize: "2.7rem",
  lineHeight: 1.05,
  letterSpacing: 0,
  fontWeight: 800,
  marginBottom: "0.45rem",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.98rem",
  lineHeight: 1.6,
  maxWidth: 760,
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>
      {children}
    </div>
  );
}
