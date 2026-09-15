import { getSupabaseClient } from "./supabase";

export type LegalSlug = "privacy" | "terms";

export type LegalPageRow = {
  slug: LegalSlug;
  title: string;
  body_md: string;
  version: number;
  last_updated: string;
  updated_by_wallet: string | null;
};

export type LegalPageVersionRow = {
  id: string;
  slug: LegalSlug;
  title: string;
  body_md: string;
  version: number;
  edited_at: string;
  edited_by_wallet: string | null;
};

const TABLE = "legal_pages";
const VERSIONS = "legal_pages_versions";

/**
 * Returns the current row for a legal slug, or null when no row
 * exists. The /privacy and /terms pages fall back to their
 * hardcoded React views in that case so the public surface never
 * regresses just because the DB is empty.
 */
export async function fetchLegalPage(slug: LegalSlug): Promise<LegalPageRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("fetchLegalPage failed", { slug, error });
    return null;
  }
  return (data as LegalPageRow | null) ?? null;
}

export async function fetchLegalVersions(slug: LegalSlug): Promise<LegalPageVersionRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(VERSIONS)
    .select("*")
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("fetchLegalVersions failed", { slug, error });
    return [];
  }
  return (data ?? []) as LegalPageVersionRow[];
}

/**
 * Markdown renderer covering the subset legal pages actually need:
 * h1/h2/h3 headings, ordered + unordered lists, paragraphs, bold,
 * italic, inline code, links. Output is HTML — body is escaped
 * BEFORE any inline pattern fires so an admin can't inject scripts.
 *
 * No code fences, no tables, no images: keep the surface small.
 * If we ever need those, swap to `react-markdown` with a sanitizer.
 */
export function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Split into blocks (separated by blank lines).
  const blocks = escaped.split(/\n{2,}/);
  const html = blocks.map(renderBlock).join("\n");
  return html;
}

function renderBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";

  // Heading: starts with 1-3 hashes followed by space.
  const heading = /^(#{1,3})\s+(.+)$/m.exec(trimmed);
  if (heading && trimmed.split("\n").length === 1) {
    const level = heading[1].length;
    return `<h${level}>${renderInline(heading[2])}</h${level}>`;
  }

  // Ordered list (lines starting with `1.` `2.` …).
  if (/^\d+\.\s+/.test(trimmed.split("\n")[0])) {
    const items = trimmed
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s+/, ""))
      .filter(Boolean)
      .map((i) => `<li>${renderInline(i)}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  }

  // Unordered list (lines starting with `- ` or `* `).
  if (/^[-*]\s+/.test(trimmed.split("\n")[0])) {
    const items = trimmed
      .split("\n")
      .map((l) => l.replace(/^[-*]\s+/, ""))
      .filter(Boolean)
      .map((i) => `<li>${renderInline(i)}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  // Paragraph: collapse internal newlines into <br>.
  return `<p>${renderInline(trimmed.replace(/\n/g, "<br/>"))}</p>`;
}

function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label: string, href: string) => {
        const safe =
          /^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("mailto:")
            ? href
            : "#";
        const target = safe.startsWith("http") ? "_blank" : "_self";
        const rel = target === "_blank" ? "noopener noreferrer" : undefined;
        return `<a href="${safe}" target="${target}"${rel ? ` rel="${rel}"` : ""}>${label}</a>`;
      }
    );
}

const STARTER_TEMPLATE: Record<LegalSlug, { title: string; body_md: string }> = {
  privacy: {
    title: "Privacy policy",
    body_md: `## Privacy policy

_Last updated 2026-04-27_

This page is now CMS-managed. Paste the current text from the
hardcoded \`/privacy\` view (or rewrite from scratch) and click
**Save**. Until you save, the public \`/privacy\` route keeps
serving the original hardcoded React view — nothing breaks.

### Markdown supported

- Headings (\`## h2\`, \`### h3\`)
- Lists (\`- bullet\` or \`1. ordered\`)
- **Bold**, *italic*, \`inline code\`
- [Links](https://nodosol.com/security)
`,
  },
  terms: {
    title: "Terms of service",
    body_md: `## Terms of service

_Last updated 2026-04-27_

This page is now CMS-managed. Paste the current text from the
hardcoded \`/terms\` view (or rewrite from scratch) and click
**Save**. Until you save, the public \`/terms\` route keeps
serving the original hardcoded React view — nothing breaks.

### Markdown supported

- Headings (\`## h2\`, \`### h3\`)
- Lists (\`- bullet\` or \`1. ordered\`)
- **Bold**, *italic*, \`inline code\`
- [Links](https://nodosol.com/privacy)
`,
  },
};

export function legalStarter(slug: LegalSlug): { title: string; body_md: string } {
  return STARTER_TEMPLATE[slug];
}
