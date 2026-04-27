import Link from "next/link";

import {
  AnnouncementRow,
  fetchActiveBanner,
  severityPalette,
} from "@/lib/announcements";

/**
 * Optional global banner — pulls the most recent pinned
 * warning/urgent announcement and renders a strip above the main
 * content. Returns null when no qualifying row is active.
 *
 * Server component so the banner ships with the SSR pass instead of
 * waiting for a client fetch round trip after first paint.
 */
export async function AnnouncementBanner() {
  let row: AnnouncementRow | null = null;
  try {
    row = await fetchActiveBanner();
  } catch {
    return null;
  }
  if (!row) return null;

  const palette = severityPalette(row.severity);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.6rem 1rem",
        background: palette.bg,
        borderBottom: `1px solid ${palette.border}`,
        color: palette.fg,
        fontSize: "0.86rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 4,
            background: palette.fg,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <strong style={{ fontWeight: 600 }}>{palette.label}:</strong>
        <span style={{ color: "var(--shell-fg, #eef0f3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.title}
        </span>
      </div>
      <Link
        href="/announcements"
        style={{
          color: palette.fg,
          fontWeight: 600,
          textDecoration: "underline",
          fontSize: "0.82rem",
          flexShrink: 0,
        }}
      >
        Details →
      </Link>
    </div>
  );
}
