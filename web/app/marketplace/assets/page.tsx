import { MarketplaceShell } from "@/components/MarketplaceShell";

type MockHolding = {
  name: string;
  symbol: string;
  category: string;
  quantity: number;
  burned: number;
  status: "Active" | "Paused" | "Retired";
  mint: string;
  tokenizedAt: string;
};

const HOLDINGS: MockHolding[] = [
  {
    name: "Organic Wheat Package",
    symbol: "OWP",
    category: "Commodity",
    quantity: 5,
    burned: 0,
    status: "Active",
    mint: "73w3…mh7h",
    tokenizedAt: "2026-04-20",
  },
  {
    name: "Pannonian Barley",
    symbol: "PBL",
    category: "Commodity",
    quantity: 10,
    burned: 2,
    status: "Active",
    mint: "8FG1…p9Kx",
    tokenizedAt: "2026-04-18",
  },
];

export default function AssetsPage() {
  const totalAssets = HOLDINGS.length;
  const totalSupply = HOLDINGS.reduce((s, h) => s + (h.quantity - h.burned), 0);

  return (
    <MarketplaceShell active="assets">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          My assets
        </h1>
        <p style={{ color: "#8a8a8a", fontSize: "0.9rem" }}>
          Assets you have tokenised as an issuer. Issuer: <span style={{ color: "#fafafa" }}>3E8Z…rqBr</span>
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard label="Tokenised assets" value={totalAssets.toString()} />
        <StatCard label="Tokens in circulation" value={totalSupply.toString()} />
        <StatCard label="Issuer status" value="Active" valueColor="#5ac878" />
      </div>

      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid #1a1a1a",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#121212", color: "#8a8a8a", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: 1 }}>
              <Th>Asset</Th>
              <Th>Category</Th>
              <Th>Supply</Th>
              <Th>Status</Th>
              <Th>Tokenised</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {HOLDINGS.map((h, i) => (
              <tr key={h.mint} style={{ borderTop: i === 0 ? "none" : "1px solid #1a1a1a" }}>
                <Td>
                  <div style={{ fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6a6a6a" }}>{h.symbol} · {h.mint}</div>
                </Td>
                <Td>{h.category}</Td>
                <Td>
                  {h.quantity - h.burned}
                  {h.burned > 0 ? <span style={{ color: "#6a6a6a", fontSize: "0.78rem" }}> / {h.quantity}</span> : null}
                </Td>
                <Td><StatusPill status={h.status} /></Td>
                <Td style={{ color: "#8a8a8a" }}>{h.tokenizedAt}</Td>
                <Td>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <Act>Burn</Act>
                    <Act>Retire</Act>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#6a6a6a" }}>
        Mock data. Live asset fetch via <code>getProgramAccounts</code> on <code>rwa_mint</code> wiring next.
      </div>
    </MarketplaceShell>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 10, padding: "1.2rem 1.3rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#8a8a8a", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ fontSize: "1.65rem", fontWeight: 600, color: valueColor ?? "#fafafa" }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "0.8rem 1rem", fontWeight: 500 }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "0.85rem 1rem", verticalAlign: "top", ...style }}>{children}</td>;
}

function StatusPill({ status }: { status: MockHolding["status"] }) {
  const colorMap = {
    Active: { bg: "rgba(90,200,120,0.12)", fg: "#5ac878" },
    Paused: { bg: "rgba(255,190,60,0.12)", fg: "#ffbe3c" },
    Retired: { bg: "rgba(150,150,150,0.12)", fg: "#9a9a9a" },
  };
  const c = colorMap[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "0.22rem 0.6rem",
        borderRadius: 4,
        fontSize: "0.78rem",
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

function Act({ children }: { children: React.ReactNode }) {
  return (
    <button
      style={{
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        color: "#fafafa",
        padding: "0.3rem 0.7rem",
        borderRadius: 4,
        fontSize: "0.78rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
