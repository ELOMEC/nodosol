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
  volumeTrend: number;
};

const MOCK: MockAsset[] = [
  { id: "OWP-1", name: "Organic Wheat Package", category: "Commodities", price: 50, quantity: "5 t", delivery: true, issuer: "Panonia Farms", jurisdictions: ["SRB"], gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)", volumeTrend: 12 },
  { id: "WAP-1", name: "Wine Adventure Package", category: "Commodities", price: 100, quantity: "1 package", delivery: true, issuer: "Plantaže A.D.", jurisdictions: ["MNE"], gradient: "linear-gradient(135deg, #be123c 0%, #881337 100%)", volumeTrend: 8 },
  { id: "AHB-1", name: "Apple Happiness Basket", category: "Commodities", price: 20, quantity: "1 basket", delivery: true, issuer: "Voćar Co-op", jurisdictions: ["SRB"], gradient: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", volumeTrend: -4 },
  { id: "ECP-1", name: "E-ticket: Exit Festival 2026", category: "Tickets", price: 150, quantity: "1 package", delivery: false, issuer: "Exit Festival", jurisdictions: ["SRB"], gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", volumeTrend: 42 },
  { id: "OWP-2", name: "Pannonian Barley", category: "Commodities", price: 45, quantity: "5 t", delivery: true, issuer: "Panonia Farms", jurisdictions: ["SRB"], gradient: "linear-gradient(135deg, #d97706 0%, #92400e 100%)", volumeTrend: 6 },
  { id: "ECP-2", name: "E-ticket: Sea Dance 2026", category: "Tickets", price: 110, quantity: "1 package", delivery: false, issuer: "Sea Dance", jurisdictions: ["MNE"], gradient: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)", volumeTrend: 18 },
  { id: "AHB-2", name: "Plum Harvest Box", category: "Commodities", price: 30, quantity: "10 kg", delivery: true, issuer: "Voćar Co-op", jurisdictions: ["SRB"], gradient: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", volumeTrend: 2 },
  { id: "WAP-2", name: "Rakija Selection", category: "Commodities", price: 75, quantity: "6 bottles", delivery: true, issuer: "Plantaže A.D.", jurisdictions: ["MNE"], gradient: "linear-gradient(135deg, #a16207 0%, #713f12 100%)", volumeTrend: 14 },
];

const CATEGORIES = ["All", "Commodities", "Tickets", "Real Estate", "Debt"];

export default function MarketplacePage() {
  const totalVolume = MOCK.reduce((s, m) => s + m.price, 0);

  return (
    <MarketplaceShell active="marketplace">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            Marketplace
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Tokenised real-world assets from licenced issuers. All trades settle on Solana.
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
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
          }}
        >
          + Tokenize asset
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total assets" value={MOCK.length.toString()} trend="+25%" positive />
        <StatCard label="Floor price" value="$20" trend="−2.5%" />
        <StatCard label="24h volume" value={`$${totalVolume.toLocaleString()}`} trend="+14%" positive />
        <StatCard label="Active issuers" value="4" trend="+1" positive />
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          padding: "1rem 1.1rem",
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: 6,
                border: "none",
                background: i === 0 ? "#eef2ff" : "transparent",
                color: i === 0 ? "#4338ca" : "#6b7280",
                fontSize: "0.82rem",
                fontWeight: i === 0 ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select style={selectStyle}>
          <option>All jurisdictions</option>
          <option>SRB — Serbia</option>
          <option>MNE — Montenegro</option>
        </select>
        <select style={selectStyle}>
          <option>All delivery types</option>
          <option>Physical delivery</option>
          <option>Digital only</option>
        </select>
        <select style={selectStyle} defaultValue="new">
          <option value="new">Sort: Newest</option>
          <option value="price-asc">Sort: Price ↑</option>
          <option value="price-desc">Sort: Price ↓</option>
          <option value="volume">Sort: Volume</option>
        </select>
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

      <div style={{ marginTop: "1.25rem", fontSize: "0.78rem", color: "#9ca3af" }}>
        Mock data — on-chain asset fetch via <code style={codeInline}>getProgramAccounts</code> wiring in progress.
      </div>
    </MarketplaceShell>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 7,
  color: "#374151",
  padding: "0.45rem 0.65rem",
  fontSize: "0.82rem",
  fontWeight: 500,
  outline: "none",
  cursor: "pointer",
};

const codeInline: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#4338ca",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.78rem",
  fontFamily: "'SF Mono', Menlo, monospace",
};

function StatCard({ label, value, trend, positive }: { label: string; value: string; trend: string; positive?: boolean }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.1rem 1.2rem",
      }}
    >
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.55rem", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</div>
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: positive ? "#10b981" : "#ef4444",
            background: positive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
            padding: "0.18rem 0.45rem",
            borderRadius: 4,
          }}
        >
          {trend}
        </div>
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: MockAsset }) {
  const up = asset.volumeTrend >= 0;
  return (
    <Link
      href={`/marketplace/assets/${asset.id}`}
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        overflow: "hidden",
        textDecoration: "none",
        color: "#111827",
        display: "block",
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
    >
      <div
        style={{
          background: asset.gradient,
          height: 130,
          position: "relative",
        }}
      >
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
          {asset.category}
        </div>
        {asset.delivery ? (
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
        <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem", lineHeight: 1.3 }}>{asset.name}</div>
        <div style={{ fontSize: "0.76rem", color: "#6b7280", marginBottom: "0.85rem" }}>
          {asset.issuer} · {asset.jurisdictions.join(", ")}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>${asset.price}</div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>per {asset.quantity}</div>
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: up ? "#10b981" : "#ef4444",
              background: up ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              padding: "0.22rem 0.5rem",
              borderRadius: 4,
            }}
          >
            {up ? "↑" : "↓"} {Math.abs(asset.volumeTrend)}%
          </div>
        </div>
      </div>
    </Link>
  );
}
