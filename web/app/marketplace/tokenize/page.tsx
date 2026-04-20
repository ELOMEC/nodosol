import { MarketplaceShell } from "@/components/MarketplaceShell";

export default function TokenizePage() {
  const input: React.CSSProperties = {
    width: "100%",
    background: "#121212",
    border: "1px solid #1e1e1e",
    borderRadius: 6,
    color: "#fafafa",
    padding: "0.6rem 0.8rem",
    fontSize: "0.92rem",
    outline: "none",
  };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: "0.78rem",
    color: "#a0a0a0",
    marginBottom: "0.3rem",
    letterSpacing: 0.3,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "#6a6a6a",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: "1rem",
  };
  const section: React.CSSProperties = {
    background: "#0f0f0f",
    border: "1px solid #1a1a1a",
    borderRadius: 10,
    padding: "1.5rem",
    marginBottom: "1rem",
  };

  return (
    <MarketplaceShell active="tokenize">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Tokenize your product
        </h1>
        <p style={{ color: "#8a8a8a", fontSize: "0.9rem" }}>
          Mints a fixed-supply Token-2022 asset tied to your issuer profile. Supply is capped at
          tokenization — you can only burn, not mint more.
        </p>
      </header>

      <div style={{ maxWidth: 780 }}>
        <div style={section}>
          <div style={sectionTitle}>General information</div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={label}>Product name</label>
            <input style={input} placeholder="Organic Wheat Package" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={label}>Category</label>
              <select style={input} defaultValue="commodity">
                <option value="commodity">Commodity</option>
                <option value="ticket">Ticket</option>
                <option value="realestate">Real Estate</option>
                <option value="debt">Debt</option>
                <option value="equity">Equity</option>
                <option value="carbon">Carbon Credit</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={label}>Symbol</label>
              <input style={input} placeholder="OWP" maxLength={16} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={label}>Quantity (tokens)</label>
              <input style={input} placeholder="5" type="number" min={1} />
            </div>
            <div>
              <label style={label}>Physical delivery required</label>
              <select style={input} defaultValue="yes">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        </div>

        <div style={section}>
          <div style={sectionTitle}>Description & media</div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={label}>Short description</label>
            <input style={input} placeholder="Sell the high quality organic wheat from Serbia" />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={label}>Long description</label>
            <textarea
              style={{ ...input, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Organic wheat cultivated without pesticides…"
            />
          </div>
          <div>
            <label style={label}>Metadata URI (IPFS / Arweave)</label>
            <input style={input} placeholder="ipfs://Qm…" />
          </div>
        </div>

        <div style={section}>
          <div style={sectionTitle}>Preview</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem 2rem",
              fontSize: "0.88rem",
            }}
          >
            <Row k="Issuer" v="3E8Z…rqBr (Active)" />
            <Row k="Jurisdiction(s)" v="SRB" />
            <Row k="Asset class permissions" v="Commodity · Ticket" />
            <Row k="Token standard" v="Token-2022 (fixed supply)" />
            <Row k="Mint authority after" v="None (revoked)" />
            <Row k="Network" v="Solana devnet" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button
            style={{
              background: "transparent",
              border: "1px solid #2a2a2a",
              color: "#fafafa",
              padding: "0.65rem 1.35rem",
              borderRadius: 6,
              fontSize: "0.92rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            disabled
            style={{
              background: "#7b9cff",
              color: "#0a0a0a",
              border: "none",
              padding: "0.65rem 1.6rem",
              borderRadius: 6,
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "not-allowed",
              opacity: 0.55,
            }}
          >
            Tokenize (wiring in progress)
          </button>
        </div>
      </div>
    </MarketplaceShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div style={{ color: "#8a8a8a" }}>{k}</div>
      <div style={{ color: "#fafafa" }}>{v}</div>
    </>
  );
}
