import Link from "next/link";

import {
  AnnouncementRow,
  renderBody,
  severityPalette,
} from "@/lib/announcements";

export function AnnouncementsView({ rows }: { rows: AnnouncementRow[] }) {
  return (
    <div style={SHELL}>
      <article style={ARTICLE}>
        <h1 style={H1}>Announcements</h1>
        <p style={LEAD}>
          Release notes, ops updates, and policy changes. Pinned
          warnings + urgents also surface as a banner across the app.
        </p>

        {rows.length === 0 ? (
          <div style={EMPTY}>
            <h2 style={H2}>Nothing here yet</h2>
            <p style={SUB}>
              When we publish updates they&apos;ll land here. In the
              meantime, the <Link href="/security" style={LINK}>security</Link>{" "}
              and <Link href="/faq" style={LINK}>FAQ</Link> pages cover
              most current questions.
            </p>
          </div>
        ) : (
          rows.map((row) => <Card key={row.id} row={row} />)
        )}
      </article>
    </div>
  );
}

function Card({ row }: { row: AnnouncementRow }) {
  const palette = severityPalette(row.severity);
  const html = renderBody(row.body);
  return (
    <section style={CARD}>
      <header style={CARD_HEAD}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
          {row.pinned ? <span style={PIN}>📌 Pinned</span> : null}
          <span
            style={{
              ...BADGE,
              background: palette.bg,
              color: palette.fg,
              borderColor: palette.border,
            }}
          >
            {palette.label}
          </span>
          <time style={STAMP} dateTime={row.published_at}>
            {new Date(row.published_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
        <h2 style={CARD_TITLE}>{row.title}</h2>
      </header>
      <div style={CARD_BODY} dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

const SHELL: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "0 0 1rem",
  color: "var(--shell-fg, #e8e8e8)",
  background: "transparent",
};

const ARTICLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const H1: React.CSSProperties = {
  fontSize: "2.4rem",
  fontWeight: 800,
  letterSpacing: 0,
  marginBottom: "0.4rem",
};

const LEAD: React.CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #b5b5b5)",
  marginBottom: "1.5rem",
};

const EMPTY: React.CSSProperties = {
  border: "1px dashed var(--shell-border, #1f242d)",
  borderRadius: 16,
  padding: "2.5rem 1.5rem",
  textAlign: "center" as const,
  background: "var(--shell-card, #11141a)",
};

const H2: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  color: "var(--shell-fg, #eef0f3)",
};

const SUB: React.CSSProperties = {
  color: "var(--shell-muted, #b5b5b5)",
  fontSize: "0.92rem",
  lineHeight: 1.55,
  maxWidth: 520,
  margin: "0 auto",
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--shell-border, #1f242d)",
  borderRadius: 16,
  padding: "1.25rem 1.4rem 1.1rem",
  background: "var(--shell-card, #11141a)",
  boxShadow: "0 16px 45px rgba(15, 23, 42, 0.06)",
};

const CARD_HEAD: React.CSSProperties = {
  marginBottom: "0.85rem",
};

const PIN: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--shell-muted, #c5cbd4)",
};

const BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.18rem 0.55rem",
  borderRadius: 999,
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  border: "1px solid",
};

const STAMP: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--shell-faint, #6b6b6b)",
};

const CARD_TITLE: React.CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "var(--shell-fg, #eef0f3)",
  marginTop: "0.6rem",
  letterSpacing: 0,
};

const CARD_BODY: React.CSSProperties = {
  fontSize: "0.94rem",
  lineHeight: 1.6,
  color: "var(--shell-muted, #c5cbd4)",
};

const LINK: React.CSSProperties = {
  color: "#7b9cff",
  textDecoration: "underline",
};
