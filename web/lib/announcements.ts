import { getSupabaseClient } from "./supabase";

export type AnnouncementSeverity = "info" | "release" | "warning" | "urgent";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  pinned: boolean;
  published_at: string;
  expires_at: string | null;
  author_wallet: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "announcements";

/**
 * Public list of currently-active announcements (RLS gates by
 * published_at + expires_at). Pinned float to top, then newest first.
 */
export async function fetchAnnouncements(limit = 50): Promise<AnnouncementRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("fetchAnnouncements failed", error);
    return [];
  }
  return (data ?? []) as AnnouncementRow[];
}

/** Top pinned warning/urgent for the global banner (or null). */
export async function fetchActiveBanner(): Promise<AnnouncementRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("pinned", true)
    .in("severity", ["warning", "urgent"])
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("fetchActiveBanner failed", error);
    return null;
  }
  return (data as AnnouncementRow | null) ?? null;
}

/** Severity → tailwind-style colour token shared across feed + banner. */
export function severityPalette(s: AnnouncementSeverity): {
  bg: string;
  fg: string;
  border: string;
  label: string;
} {
  switch (s) {
    case "urgent":
      return {
        bg: "rgba(239,68,68,0.12)",
        fg: "#ef4444",
        border: "rgba(239,68,68,0.32)",
        label: "Urgent",
      };
    case "warning":
      return {
        bg: "rgba(245,158,11,0.12)",
        fg: "#f59e0b",
        border: "rgba(245,158,11,0.32)",
        label: "Warning",
      };
    case "release":
      return {
        bg: "rgba(16,185,129,0.12)",
        fg: "#10b981",
        border: "rgba(16,185,129,0.32)",
        label: "Release",
      };
    case "info":
    default:
      return {
        bg: "rgba(123,156,255,0.12)",
        fg: "#7b9cff",
        border: "rgba(123,156,255,0.32)",
        label: "Info",
      };
  }
}

/**
 * Tiny Markdown-ish renderer — paragraphs split by blank lines,
 * inline `code`, **bold**, [links](href). HTML in the body is escaped
 * before any pattern fires so admin can't inject scripts.
 *
 * For announcement bodies (a few paragraphs of staff-authored text)
 * this is plenty; we'd reach for a full Markdown lib only if we
 * needed lists / images / headings.
 */
export function renderBody(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const inline = escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, text: string, href: string) => {
        const safe = /^https?:\/\//i.test(href) || href.startsWith("/")
          ? href
          : "#";
        return `<a href="${safe}" target="${
          safe.startsWith("/") ? "_self" : "_blank"
        }" rel="noreferrer">${text}</a>`;
      }
    );
  return inline
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
