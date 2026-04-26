"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { USDC_UNIT } from "@/lib/constants";
import { subscriptionProgram } from "@/lib/subscription";
import { fetchRentalMetadataBatch, RentalMetadata } from "@/lib/rentalMetadata";
import { EmptyState } from "@/components/EmptyState";
import { MarketSearchBar } from "@/components/MarketSearchBar";

type RentalPlan = {
  address: string;
  creator: string;
  priceUsdc: number;
  periodSeconds: number;
  active: boolean;
  subscriberCount: number;
  createdAt: number;
  metadata: RentalMetadata | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; plans: RentalPlan[] }
  | { kind: "error"; message: string };

type Filter = "active" | "mine" | "all";

export function RentalsView() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortKey, setSortKey] = useState<"newest" | "price_asc" | "price_desc" | "popular">("newest");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = subscriptionProgram(provider);
      const api = (program.account as Record<string, {
        all: () => Promise<Array<{
          publicKey: PublicKey;
          account: {
            creator: PublicKey;
            pricePerPeriod: BN;
            periodSeconds: BN;
            active: boolean;
            subscriberCount: BN;
            createdAt: BN;
          };
        }>>;
      }>).subscriptionPlan;
      const items = await api.all();
      const addresses = items.map((x) => x.publicKey.toBase58());
      const metaMap = await fetchRentalMetadataBatch(addresses);

      const plans: RentalPlan[] = items
        .map(({ publicKey: pk, account }) => ({
          address: pk.toBase58(),
          creator: account.creator.toBase58(),
          priceUsdc: Number(account.pricePerPeriod.toString()) / USDC_UNIT,
          periodSeconds: account.periodSeconds.toNumber(),
          active: account.active,
          subscriberCount: account.subscriberCount.toNumber(),
          createdAt: account.createdAt.toNumber(),
          metadata: metaMap.get(pk.toBase58()) ?? null,
        }))
        // Only plans that have rental metadata count as rentals — other
        // plans are generic creator subscriptions.
        .filter((p) => p.metadata !== null);
      setState({ kind: "ready", plans });
    } catch (err) {
      console.error(err);
      setState({ kind: "error", message: err instanceof Error ? err.message : "Load failed" });
    }
  }, [connection, wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const me = publicKey?.toBase58();
    const q = search.trim().toLowerCase();
    const min = priceMin === "" ? null : Number(priceMin);
    const max = priceMax === "" ? null : Number(priceMax);
    return state.plans
      .filter((p) => {
        if (filter === "mine") return me && p.creator === me;
        if (filter === "active") return p.active;
        return true;
      })
      .filter((p) => {
        if (q) {
          const title = (p.metadata?.title ?? "").toLowerCase();
          const addr = (p.metadata?.location?.address ?? "").toLowerCase();
          if (!title.includes(q) && !addr.includes(q) && !p.creator.toLowerCase().includes(q)) return false;
        }
        if (min !== null && !Number.isNaN(min) && p.priceUsdc < min) return false;
        if (max !== null && !Number.isNaN(max) && p.priceUsdc > max) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "newest":
            return b.createdAt - a.createdAt;
          case "price_asc":
            return a.priceUsdc - b.priceUsdc;
          case "price_desc":
            return b.priceUsdc - a.priceUsdc;
          case "popular":
            return b.subscriberCount - a.subscriberCount;
        }
      });
  }, [state, filter, publicKey, search, priceMin, priceMax, sortKey]);

  return (
    <>
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", letterSpacing: "-0.02em", fontWeight: 600, marginBottom: "0.3rem" }}>
            Rentals
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", maxWidth: 720 }}>
            Monthly-rent listings settled on-chain. Landlord creates a plan
            with a fixed monthly USDC price. Tenant pre-approves N cycles
            on subscribe; the program pulls rent automatically each period
            via the delegate pattern.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            href="/marketplace/rentals/my"
            style={{
              background: "var(--shell-card, #fff)",
              color: "var(--shell-fg, #111827)",
              padding: "0.55rem 1.1rem",
              borderRadius: 8,
              border: "1px solid var(--shell-border, #eef0f3)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            My rentals
          </Link>
          <Link
            href="/marketplace/rentals/new"
            style={{
              background: "#4f46e5",
              color: "#fff",
              padding: "0.55rem 1.1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            + List a rental
          </Link>
        </div>
      </header>

      <Card>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(["active", "mine", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: 6,
                border: filter === f ? "1px solid #4f46e5" : "1px solid var(--shell-border, #eef0f3)",
                background: filter === f ? "#eef2ff" : "var(--shell-card, #fff)",
                color: filter === f ? "#3730a3" : "var(--shell-fg, #111827)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      <MarketSearchBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search by title, address, or landlord…"
        priceMin={priceMin}
        priceMax={priceMax}
        onPriceMin={setPriceMin}
        onPriceMax={setPriceMax}
        priceLabel="Price/period"
        sortKey={sortKey}
        onSort={setSortKey}
        sortOptions={[
          { value: "newest", label: "Sort: Newest" },
          { value: "price_asc", label: "Sort: Price ↑" },
          { value: "price_desc", label: "Sort: Price ↓" },
          { value: "popular", label: "Sort: Most tenants" },
        ]}
        filteredCount={visible.length}
        totalCount={state.kind === "ready" ? state.plans.length : 0}
        countLabel="rentals"
      />

      {state.kind === "loading" && <Card><Centered>Loading…</Centered></Card>}
      {state.kind === "error" && <Card><Centered>{state.message}</Centered></Card>}
      {state.kind === "ready" && (
        visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="rentals"
              title={filter === "mine" ? "You haven't listed any rentals" : "No rentals yet"}
              description={
                filter === "mine"
                  ? "List a property, coworking space, or experience and start collecting recurring USDC."
                  : "Be the first to list a rental — discoverable by everyone in the marketplace."
              }
              actions={[
                ...(filter === "mine"
                  ? [{ label: "List a rental", href: "/marketplace/rentals/new", variant: "primary" as const }]
                  : []),
                ...(filter !== "active"
                  ? [{ label: "Show active rentals", onClick: () => setFilter("active"), variant: "secondary" as const }]
                  : []),
              ]}
            />
          </Card>
        ) : (
          <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.85rem" }}>
            {visible.map((p) => (
              <RentalCard key={p.address} plan={p} />
            ))}
          </div>
        )
      )}
    </>
  );
}

function RentalCard({ plan }: { plan: RentalPlan }) {
  const title = plan.metadata?.title || "Untitled rental";
  const hero = plan.metadata?.gallery?.[0];
  const periodDays = Math.round(plan.periodSeconds / 86400);

  return (
    <Link
      href={`/marketplace/rentals/${plan.address}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          background: "var(--shell-card, #fff)",
          border: "1px solid var(--shell-border, #eef0f3)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div
          style={{
            height: 140,
            background: hero
              ? `center / cover no-repeat url(${hero})`
              : "linear-gradient(135deg, #4f46e5, #0ea5e9)",
          }}
        />
        <div style={{ padding: "0.85rem 1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
          {plan.metadata?.location?.address && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              📍 {plan.metadata.location.address}
            </div>
          )}
          <div style={{ fontSize: "0.82rem", color: "var(--shell-fg, #111827)", fontWeight: 600, marginTop: "0.15rem" }}>
            ${plan.priceUsdc.toFixed(2)} USDC / {periodDays} day{periodDays === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
            {plan.subscriberCount} active {plan.subscriberCount === 1 ? "tenant" : "tenants"}
            {!plan.active && " · paused"}
          </div>
        </div>
      </div>
    </Link>
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
        marginBottom: "0.85rem",
      }}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#6b7280" }}>{children}</div>;
}
