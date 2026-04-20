import Link from "next/link";

import { MarketplaceShell } from "@/components/MarketplaceShell";

type MockAsset = {
  id: string;
  name: string;
  category: "Commodities" | "Tickets" | "Real Estate" | "Debt";
  price: number;
  quantity: string;
  delivery: boolean;
  issuer: string;
  jurisdictions: string[];
  gradient: string;
};

const MOCK: MockAsset[] = [
  {
    id: "OWP-1",
    name: "Organic Wheat Package",
    category: "Commodities",
    price: 50,
    quantity: "5 t",
    delivery: true,
    issuer: "Panonia Farms",
    jurisdictions: ["SRB"],
    gradient: "linear-gradient(135deg, #8b6914 0%, #d4a017 100%)",
  },
  {
    id: "WAP-1",
    name: "Wine Adventure Package",
    category: "Commodities",
    price: 100,
    quantity: "1 package",
    delivery: true,
    issuer: "Plantaže A.D.",
    jurisdictions: ["MNE"],
    gradient: "linear-gradient(135deg, #4a1a2c 0%, #8b2a4a 100%)",
  },
  {
    id: "AHB-1",
    name: "Apple Happiness Basket",
    category: "Commodities",
    price: 20,
    quantity: "1 basket",
    delivery: true,
    issuer: "Voćar Co-op",
    jurisdictions: ["SRB"],
    gradient: "linear-gradient(135deg, #6b2020 0%, #c44545 100%)",
  },
  {
    id: "ECP-1",
    name: "E-ticket: Exit Festival 2026",
    category: "Tickets",
    price: 150,
    quantity: "1 package",
    delivery: false,
    issuer: "Exit Festival",
    jurisdictions: ["SRB"],
    gradient: "linear-gradient(135deg, #2a0e4a 0%, #6a2ca8 100%)",
  },
  {
    id: "OWP-2",
    name: "Pannonian Barley",
    category: "Commodities",
    price: 45,
    quantity: "5 t",
    delivery: true,
    issuer: "Panonia Farms",
    jurisdictions: ["SRB"],
    gradient: "linear-gradient(135deg, #6a5414 0%, #a88a1a 100%)",
  },
  {
    id: "ECP-2",
    name: "E-ticket: Sea Dance 2026",
    category: "Tickets",
    price: 110,
    quantity: "1 package",
    delivery: false,
    issuer: "Sea Dance",
    jurisdictions: ["MNE"],
    gradient: "linear-gradient(135deg, #0a4a6a 0%, #2ca8c4 100%)",
  },
  {
    id: "AHB-2",
    name: "Plum Harvest Box",
    category: "Commodities",
    price: 30,
    quantity: "10 kg",
    delivery: true,
    issuer: "Voćar Co-op",
    jurisdictions: ["SRB"],
    gradient: "linear-gradient(135deg, #2a1a4a 0%, #5a3a8a 100%)",
  },
  {
    id: "WAP-2",
    name: "Rakija Selection",
    category: "Commodities",
    price: 75,
    quantity: "6 bottles",
    delivery: true,
    issuer: "Plantaže A.D.",
    jurisdictions: ["MNE"],
    gradient: "linear-gradient(135deg, #4a2a0a 0%, #a06a2a 100%)",
  },
];

export default function MarketplacePage() {
  return (
    <MarketplaceShell active="marketplace">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Marketplace
        </h1>
        <p style={{ color: "#8a8a8a", fontSize: "0.9rem" }}>
          Tokenised real-world assets from licenced issuers. All trades settle on Solana.
        </p>
      </header>

      <Filters />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "2rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.9rem", color: "#a0a0a0" }}>
          Showing <span style={{ color: "#fafafa" }}>{MOCK.length}</span> assets
        </div>
        <div style={{ fontSize: "0.8rem", color: "#6a6a6a" }}>Mock data — wiring to on-chain in progress</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        {MOCK.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    </MarketplaceShell>
  );
}

function Filters() {
  const input: React.CSSProperties = {
    background: "#121212",
    border: "1px solid #1e1e1e",
    borderRadius: 6,
    color: "#fafafa",
    padding: "0.55rem 0.75rem",
    fontSize: "0.9rem",
    outline: "none",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
        gap: "0.75rem",
        padding: "1rem",
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 8,
      }}
    >
      <input placeholder="Search assets…" style={input} />
      <select style={input} defaultValue="all">
        <option value="all">All categories</option>
        <option>Commodities</option>
        <option>Tickets</option>
        <option>Real Estate</option>
        <option>Debt</option>
      </select>
      <input placeholder="Price min" style={input} type="number" />
      <input placeholder="Price max" style={input} type="number" />
      <button
        style={{
          background: "#7b9cff",
          color: "#0a0a0a",
          border: "none",
          borderRadius: 6,
          padding: "0.55rem 1.25rem",
          fontSize: "0.9rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Filter
      </button>
    </div>
  );
}

function AssetCard({ asset }: { asset: MockAsset }) {
  return (
    <Link
      href={`/marketplace/assets/${asset.id}`}
      style={{
        background: "#0f0f0f",
        border: "1px solid #1a1a1a",
        borderRadius: 10,
        overflow: "hidden",
        textDecoration: "none",
        color: "#fafafa",
        display: "block",
        transition: "border-color 0.15s",
      }}
    >
      <div
        style={{
          background: asset.gradient,
          height: 140,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(10,10,10,0.6)",
            padding: "0.2rem 0.55rem",
            borderRadius: 4,
            fontSize: "0.7rem",
            fontWeight: 500,
            backdropFilter: "blur(10px)",
          }}
        >
          {asset.category}
        </div>
        {asset.delivery ? (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              background: "rgba(123,156,255,0.15)",
              color: "#7b9cff",
              padding: "0.2rem 0.55rem",
              borderRadius: 4,
              fontSize: "0.68rem",
              fontWeight: 500,
            }}
          >
            Physical delivery
          </div>
        ) : null}
      </div>
      <div style={{ padding: "0.9rem 1rem 1rem" }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem" }}>{asset.name}</div>
        <div style={{ fontSize: "0.75rem", color: "#7a7a7a", marginBottom: "0.85rem" }}>
          {asset.issuer} · {asset.jurisdictions.join(", ")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>${asset.price}</div>
            <div style={{ fontSize: "0.7rem", color: "#6a6a6a" }}>per {asset.quantity}</div>
          </div>
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              padding: "0.35rem 0.65rem",
              borderRadius: 5,
              fontSize: "0.75rem",
            }}
          >
            View →
          </div>
        </div>
      </div>
    </Link>
  );
}
