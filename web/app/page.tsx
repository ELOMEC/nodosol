import { getAppUrl } from "@/lib/constants";

export default function HomePage() {
  const appUrl = getAppUrl();
  const demoCreator = process.env.NEXT_PUBLIC_DEMO_CREATOR ?? "";
  const demoPlanId = process.env.NEXT_PUBLIC_DEMO_PLAN_ID ?? "1";
  const demoEventId = process.env.NEXT_PUBLIC_DEMO_EVENT_ID ?? "1";

  const hasDemo = demoCreator.length > 0;
  const creatorSlug = hasDemo ? demoCreator : "<creator-wallet>";
  const planSlug = hasDemo ? demoPlanId : "<plan-id>";
  const eventSlug = hasDemo ? demoEventId : "<event-id>";

  const tipUrl = `${appUrl}/api/actions/tip/${creatorSlug}`;
  const subUrl = `${appUrl}/api/actions/subscribe/${creatorSlug}/${planSlug}`;
  const ticketUrl = `${appUrl}/api/actions/ticket/${creatorSlug}/${eventSlug}`;

  const nativeTip = `/b/tip/${creatorSlug}`;
  const nativeSub = `/b/subscribe/${creatorSlug}/${planSlug}`;
  const nativeTicket = `/b/ticket/${creatorSlug}/${eventSlug}`;

  const dialLink = (url: string) =>
    `https://dial.to/?action=solana-action:${encodeURIComponent(url)}`;

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
          {hasDemo ? "Live demo Blinks (devnet)" : "Solana Actions endpoints"}
        </h2>
        <p style={{ color: "#9a9a9a", marginBottom: "1rem" }}>
          {hasDemo ? (
            <>
              Open a URL below in{" "}
              <a href="https://dial.to/" target="_blank" rel="noreferrer">
                dial.to
              </a>{" "}
              (or any Blink-aware wallet) to sign with Phantom / Backpack.
              Creator <code>{demoCreator}</code> is seeded with a $5/month
              plan and a $10 event.
            </>
          ) : (
            <>
              Paste either URL into{" "}
              <a href="https://dial.to/" target="_blank" rel="noreferrer">
                dial.to
              </a>{" "}
              or a Blink-aware wallet to preview the interaction.
            </>
          )}
        </p>

        <BlinkRow
          label="Tip"
          url={tipUrl}
          live={hasDemo}
          native={nativeTip}
          dial={dialLink(tipUrl)}
        />
        <BlinkRow
          label="Subscribe"
          url={subUrl}
          live={hasDemo}
          native={nativeSub}
          dial={dialLink(subUrl)}
        />
        <BlinkRow
          label="Ticket"
          url={ticketUrl}
          live={hasDemo}
          native={nativeTicket}
          dial={dialLink(ticketUrl)}
        />
      </section>

      <section
        style={{ marginTop: "3rem", color: "#6a6a6a", fontSize: "0.9rem" }}
      >
        <p>
          Programs deployed on devnet. Set{" "}
          <code>NEXT_PUBLIC_DEMO_CREATOR</code> in <code>.env</code> after
          running <code>npm run init-demo</code> to surface live URLs here.
        </p>
      </section>
    </main>
  );
}

function BlinkRow({
  label,
  url,
  live,
  native,
  dial,
}: {
  label: string;
  url: string;
  live: boolean;
  native: string;
  dial: string;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ color: "#7a7a7a", fontSize: "0.75rem", letterSpacing: 1 }}>
        {label.toUpperCase()}
      </div>
      <pre style={{ marginTop: "0.25rem" }}>{url}</pre>
      {live ? (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginTop: "0.4rem",
            fontSize: "0.85rem",
          }}
        >
          <a href={native}>Open on nodosol →</a>
          <a href={dial} target="_blank" rel="noreferrer">
            Open in dial.to →
          </a>
        </div>
      ) : null}
    </div>
  );
}
