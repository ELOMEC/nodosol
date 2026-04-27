import { fetchLegalPage, renderMarkdown } from "@/lib/legalPages";

import { TermsView } from "./TermsView";

export const metadata = {
  title: "Terms of service · nodosol",
  description:
    "Eligibility, services description, prohibited uses, liability disclaimer, and governing law for the Nodosol Solana super-app.",
};

export const revalidate = 60;

export default async function TermsPage() {
  // U2 — CMS first, hardcoded view as fallback. See note in /privacy.
  const row = await fetchLegalPage("terms").catch(() => null);
  if (!row) return <TermsView />;

  return (
    <main
      style={{
        background: "#0a0a0a",
        color: "#e8e8e8",
        minHeight: "100vh",
        padding: "3rem 1.25rem 5rem",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <article
        style={{
          maxWidth: 760,
          margin: "0 auto",
          fontSize: "0.95rem",
          lineHeight: 1.65,
        }}
        className="nds-legal-prose"
      >
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2rem", margin: 0, color: "#fff" }}>{row.title}</h1>
          <div style={{ fontSize: "0.78rem", color: "#7a8190", marginTop: "0.4rem" }}>
            Last updated {new Date(row.last_updated).toISOString().slice(0, 10)} · v{row.version}
          </div>
        </header>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(row.body_md) }} />
      </article>
    </main>
  );
}
