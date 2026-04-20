import { MarketplaceShell } from "@/components/MarketplaceShell";

export default function TokenizePage() {
  return (
    <MarketplaceShell active="tokenize">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.65rem", letterSpacing: "-0.02em", marginBottom: "0.3rem", fontWeight: 600 }}>
          Tokenize asset
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Mints a fixed-supply Token-2022 asset tied to your issuer profile. Supply is capped at
          tokenisation — you can burn later, but never mint more.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "flex-start" }}>
        <div>
          <Stepper current={0} />

          <Section title="General information" subtitle="Basic details shown in the marketplace card">
            <Field label="Product name">
              <input style={inputStyle} placeholder="Organic Wheat Package" />
            </Field>
            <Row>
              <Field label="Category">
                <select style={inputStyle} defaultValue="commodity">
                  <option value="commodity">Commodity</option>
                  <option value="ticket">Ticket</option>
                  <option value="realestate">Real Estate</option>
                  <option value="debt">Debt</option>
                  <option value="equity">Equity</option>
                  <option value="carbon">Carbon Credit</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Symbol">
                <input style={inputStyle} placeholder="OWP" maxLength={16} />
              </Field>
            </Row>
            <Row>
              <Field label="Quantity (tokens)">
                <input style={inputStyle} placeholder="5" type="number" min={1} />
              </Field>
              <Field label="Physical delivery">
                <select style={inputStyle} defaultValue="yes">
                  <option value="yes">Yes — requires off-chain fulfilment</option>
                  <option value="no">No — digital only</option>
                </select>
              </Field>
            </Row>
          </Section>

          <Section title="Description & media" subtitle="Rich content shown on the asset detail page">
            <Field label="Short description">
              <input style={inputStyle} placeholder="Sell high quality organic wheat from Serbia" />
            </Field>
            <Field label="Long description">
              <textarea
                style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Organic wheat cultivated without pesticides…"
              />
            </Field>
            <Field label="Metadata URI (IPFS / Arweave)">
              <input style={inputStyle} placeholder="ipfs://Qm…" />
            </Field>
          </Section>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button style={btnSecondary}>Save draft</button>
            <button disabled style={{ ...btnPrimary, opacity: 0.55, cursor: "not-allowed" }}>
              Tokenize on Solana
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "right", marginTop: "0.4rem" }}>
            On-chain wiring in progress. Submit will call <code style={codeInline}>rwa_mint::tokenize_asset</code>.
          </p>
        </div>

        <aside style={{ position: "sticky", top: 88 }}>
          <div style={panel}>
            <div style={panelHeader}>Issuer context</div>
            <div style={panelBody}>
              <InfoRow k="Wallet" v="3E8Z…rqBr" />
              <InfoRow k="Status" v={<StatusPill />} />
              <InfoRow k="Jurisdictions" v="SRB" />
              <InfoRow k="Authorised classes" v="Commodity · Ticket" />
              <InfoRow k="KYC ref" v="DEMO-KYC-001" />
            </div>
          </div>

          <div style={{ ...panel, marginTop: "1rem" }}>
            <div style={panelHeader}>Tokenisation summary</div>
            <div style={panelBody}>
              <InfoRow k="Token standard" v="Token-2022" />
              <InfoRow k="Supply model" v="Fixed (no further mints)" />
              <InfoRow k="Mint authority after" v="Revoked" />
              <InfoRow k="Burn authority" v="Issuer only" />
              <InfoRow k="Network" v="Solana devnet" />
            </div>
          </div>

          <div style={{ ...panel, marginTop: "1rem", background: "#eef2ff", borderColor: "#c7d2fe" }}>
            <div style={{ ...panelHeader, color: "#4338ca" }}>Compliance</div>
            <div style={{ ...panelBody, color: "#3730a3", fontSize: "0.82rem" }}>
              Tokenising on Nodosol requires an Active issuer record in
              <code style={{ ...codeInline, background: "#ddd6fe", color: "#4338ca" }}>rwa_registry</code>
              with the requested asset class authorised.
            </div>
          </div>
        </aside>
      </div>
    </MarketplaceShell>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["General info", "Description", "Review", "Tokenize"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "1.25rem",
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 10,
        padding: "0.7rem 0.9rem",
      }}
    >
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  background: done ? "#10b981" : active ? "#4f46e5" : "#e5e7eb",
                  color: done || active ? "#fff" : "#6b7280",
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span style={{ fontSize: "0.84rem", color: active ? "#111827" : "#6b7280", fontWeight: active ? 600 : 500 }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div style={{ flex: 1, height: 1, background: done ? "#10b981" : "#e5e7eb" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.3rem 1.4rem",
        marginBottom: "1rem",
      }}
    >
      <div style={{ marginBottom: "1.1rem" }}>
        <h3 style={{ fontSize: "0.98rem", fontWeight: 600, marginBottom: "0.2rem" }}>{title}</h3>
        <p style={{ fontSize: "0.82rem", color: "#6b7280" }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.95rem" }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.35rem" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.95rem" }}>{children}</div>;
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{k}</span>
      <span style={{ fontSize: "0.82rem", color: "#111827", fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function StatusPill() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: "rgba(16,185,129,0.12)",
        color: "#059669",
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
      Active
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#111827",
  padding: "0.62rem 0.8rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.65rem 1.4rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
};

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.65rem 1.25rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
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

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #eef0f3",
  borderRadius: 12,
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  padding: "0.85rem 1rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#111827",
  borderBottom: "1px solid #eef0f3",
  background: "#fafbfc",
};

const panelBody: React.CSSProperties = {
  padding: "0.4rem 1rem 0.85rem",
};
