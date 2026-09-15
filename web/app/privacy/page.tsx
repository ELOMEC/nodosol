import { PublicPageShell } from "@/components/PublicPageShell";
import { fetchLegalPage, renderMarkdown } from "@/lib/legalPages";

import { PrivacyView } from "./PrivacyView";

export const metadata = {
  title: "Privacy policy · nodosol",
  description:
    "What Nodosol collects, what we don't, retention windows, sub-processors, and your rights as a user.",
};

export const revalidate = 60;

export default async function PrivacyPage() {
  // U2 — try the CMS first; fall through to the hardcoded view when
  // no row exists or the fetch errors. This keeps the public surface
  // identical to before the migration ran, while letting an admin
  // override the content from /admin/legal/privacy without a deploy.
  const row = await fetchLegalPage("privacy").catch(() => null);
  if (!row) {
    return (
      <PublicPageShell active="privacy">
        <PrivacyView />
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell active="privacy">
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
    </PublicPageShell>
  );
}
