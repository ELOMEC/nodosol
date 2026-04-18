import { getAppUrl } from "@/lib/constants";

export default function HomePage() {
  const appUrl = getAppUrl();
  const tipExample = `${appUrl}/api/actions/tip/<creator-wallet>`;
  const subExample = `${appUrl}/api/actions/subscribe/<creator-wallet>/<plan-id>`;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "4rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}>
        nodosol
      </h1>
      <p style={{ marginTop: "0.5rem", color: "#9a9a9a" }}>
        creator economy on Solana — tip jars, subscriptions, tickets.
      </p>

      <section style={{ marginTop: "3rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
          Solana Actions endpoints
        </h2>
        <p style={{ color: "#9a9a9a", marginBottom: "1rem" }}>
          Paste either URL into{" "}
          <a
            href="https://dial.to/"
            target="_blank"
            rel="noreferrer"
          >
            dial.to
          </a>{" "}
          or a Blink-aware wallet to preview the interaction.
        </p>
        <pre>{tipExample}</pre>
        <pre style={{ marginTop: "0.75rem" }}>{subExample}</pre>
      </section>

      <section style={{ marginTop: "3rem", color: "#6a6a6a", fontSize: "0.9rem" }}>
        <p>
          Programs deployed on devnet. USDC refers to the devnet mint; swap{" "}
          <code>NEXT_PUBLIC_USDC_MINT</code> for mainnet use.
        </p>
      </section>
    </main>
  );
}
