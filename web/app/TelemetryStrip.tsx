"use client";

import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useEffect, useState } from "react";

import tipJarIdl from "@/idl/tip_jar.json";
import subscriptionIdl from "@/idl/subscription.json";
import eventsIdl from "@/idl/events.json";
import eventTicketsIdl from "@/idl/event_tickets.json";
import registryIdl from "@/idl/rwa_registry.json";
import mintIdl from "@/idl/rwa_mint.json";
import marketplaceIdl from "@/idl/marketplace.json";
import otcIdl from "@/idl/otc_deals.json";
import auctionsIdl from "@/idl/auctions.json";

type Counts = {
  creators: number;
  subscriptionPlans: number;
  events: number;
  cnftEvents: number;
  issuers: number;
  rwaAssets: number;
  listings: number;
  otcDeals: number;
  auctions: number;
};

class ReadOnlyWallet {
  readonly payer = Keypair.generate();
  readonly publicKey = this.payer.publicKey;
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T) {
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]) {
    return txs;
  }
}

function programInstance(idl: unknown, provider: AnchorProvider): Program {
  return new Program(idl as Idl, provider);
}

async function countAll(connection: Connection): Promise<Counts> {
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });

  async function safeCount(
    program: Program,
    accountName: string
  ): Promise<number> {
    try {
      const api = (program.account as Record<string, { all: () => Promise<unknown[]> }>)[accountName];
      if (!api) return 0;
      const items = await api.all();
      return items.length;
    } catch {
      return 0;
    }
  }

  const [
    creators,
    subscriptionPlans,
    events,
    cnftEvents,
    issuers,
    rwaAssets,
    listings,
    otcDeals,
    auctions,
  ] = await Promise.all([
    safeCount(programInstance(tipJarIdl, provider), "creatorProfile"),
    safeCount(programInstance(subscriptionIdl, provider), "plan"),
    safeCount(programInstance(eventsIdl, provider), "event"),
    safeCount(programInstance(eventTicketsIdl, provider), "event"),
    safeCount(programInstance(registryIdl, provider), "issuer"),
    safeCount(programInstance(mintIdl, provider), "asset"),
    safeCount(programInstance(marketplaceIdl, provider), "listing"),
    safeCount(programInstance(otcIdl, provider), "deal"),
    safeCount(programInstance(auctionsIdl, provider), "auction"),
  ]);

  return {
    creators,
    subscriptionPlans,
    events,
    cnftEvents,
    issuers,
    rwaAssets,
    listings,
    otcDeals,
    auctions,
  };
}

export function TelemetryStrip() {
  const { connection } = useConnection();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void countAll(connection).then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const items = [
    { label: "Creators", value: counts?.creators },
    { label: "Plans", value: counts?.subscriptionPlans },
    { label: "Events (legacy)", value: counts?.events },
    { label: "Events (cNFT)", value: counts?.cnftEvents },
    { label: "Licenced issuers", value: counts?.issuers },
    { label: "RWA assets", value: counts?.rwaAssets },
    { label: "Listings", value: counts?.listings },
    { label: "OTC deals", value: counts?.otcDeals },
    { label: "Auctions", value: counts?.auctions },
  ];

  return (
    <div
      className="nds-telemetry-strip"
      style={{
        padding: "1rem",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: 0,
              minHeight: "2rem",
              lineHeight: 1,
            }}
          >
            {item.value === undefined ? "—" : item.value}
          </div>
          <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: "0.3rem", letterSpacing: 0.6, textTransform: "uppercase" }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
