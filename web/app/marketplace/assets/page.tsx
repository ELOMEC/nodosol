import Link from "next/link";

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
  gradient: string;
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
    tokenizedAt: "Apr 20, 2026",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  {
    name: "Pannonian Barley",
    symbol: "PBL",
    category: "Commodity",
    quantity: 10,
    burned: 2,
    status: "Active",
    mint: "8FG1…p9Kx",
    tokenizedAt: "Apr 18, 2026",
    gradient: "linear-gradient(135deg, #d97706 0%, #92400e 100%)",
  },
];

export default function AssetsPage() {
  const totalAssets = HOLDINGS.length;
  const totalSupply = HOLDINGS.reduce((s, h) => s + (h.quantity - h.burned), 0);
  const totalValue = 340; // mock, will read from marketplace listings later

  return (
    <MarketplaceShell active="assets">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", gap: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
            My assets
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Assets you have tokenised as an issuer. Issuer wallet:{" "}
            <span style={{ color: "#111827", fontWeight: 500 }}>3E8Z…rqBr</span>
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
            boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
          }}
        >
          + Tokenize asset
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Tokenised assets" value={totalAssets.toString()} sub="2 active · 0 retired" />
        <StatCard label="Tokens in circulation" value={totalSupply.toString()} sub={`${HOLDINGS.reduce((s, h) => s + h.burned, 0)} burned`} />
        <StatCard label="Portfolio value (est.)" value={`$${totalValue}`} sub="Based on last listing price" />
        <StatCard label="Issuer status" value="Active" valueColor="#059669" sub="SRB · Commodity, Ticket" />
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef0f3",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1.2rem", borderBottom: "1px solid #eef0f3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Tokenised assets</h3>
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.15rem" }}>Manage supply, status, and marketplace listings</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={tabBtn(true)}>All</button>
            <button style={tabBtn(false)}>Fungible</button>
            <button style={tabBtn(false)}>Non-fungible</button>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "#fafbfc", color: "#6b7280", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: 0.8 }}>
              <Th>Asset</Th>
              <Th>Category</Th>
              <Th>Supply</Th>
              <Th>Status</Th>
              <Th>Tokenised</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {HOLDINGS.map((h) => (
              <tr key={h.mint} style={{ borderTop: "1px solid #f1f2f4" }}>
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: h.gradient }} />
                    <div>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{h.name}</div>
                      <div style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "'SF Mono', Menlo, monospace" }}>
                        {h.symbol} · {h.mint}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <span style={{ fontSize: "0.78rem", color: "#6b7280", background: "#f3f4f6", padding: "0.2rem 0.55rem", borderRadius: 4, fontWeight: 500 }}>
                    {h.category}
                  </span>
                </Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{h.quantity - h.burned}</div>
                  {h.burned > 0 ? (
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{h.burned} burned of {h.quantity}</div>
                  ) : (
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>of {h.quantity} total</div>
                  )}
                </Td>
                <Td><StatusPill status={h.status} /></Td>
                <Td style={{ color: "#6b7280" }}>{h.tokenizedAt}</Td>
                <Td align="right">
                  <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                    <button style={actBtn}>List</button>
                    <button style={actBtn}>Burn</button>
                    <button style={actBtn}>⋯</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.78rem", color: "#9ca3af" }}>
        Mock data — live fetch via <code style={codeInline}>getProgramAccounts</code> on <code style={codeInline}>rwa_mint</code> coming next.
      </div>
    </MarketplaceShell>
  );
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eef0f3", borderRadius: 12, padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.5rem", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 600, letterSpacing: "-0.02em", color: valueColor ?? "#111827" }}>{value}</div>
      <div style={{ fontSize: "0.76rem", color: "#9ca3af", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ textAlign: align ?? "left", padding: "0.8rem 1.2rem", fontWeight: 600 }}>{children}</th>;
}

function Td({ children, align, style }: { children: React.ReactNode; align?: "left" | "right"; style?: React.CSSProperties }) {
  return <td style={{ padding: "1rem 1.2rem", verticalAlign: "middle", textAlign: align ?? "left", ...style }}>{children}</td>;
}

function StatusPill({ status }: { status: MockHolding["status"] }) {
  const map = {
    Active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981" },
    Paused: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b" },
    Retired: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280" },
  };
  const c = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: c.bg,
        color: c.fg,
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {status}
    </span>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "0.4rem 0.85rem",
    borderRadius: 6,
    border: "none",
    background: active ? "#eef2ff" : "transparent",
    color: active ? "#4338ca" : "#6b7280",
    fontSize: "0.8rem",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
  };
}

const actBtn: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  color: "#374151",
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  fontSize: "0.78rem",
  fontWeight: 500,
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
