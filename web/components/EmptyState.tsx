import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateAction = {
  label: string;
  /** Either an internal Next link href… */
  href?: string;
  /** …or an inline button click handler. Mutually exclusive with href. */
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

export type EmptyStateIcon =
  | "events"
  | "auctions"
  | "rentals"
  | "properties"
  | "resale"
  | "search"
  | "default";

/**
 * Shared illustrated empty state for marketplace surfaces.
 *
 * Renders a centred card (transparent so it inherits the parent
 * background) with a small inline SVG, a short headline, optional
 * description, and 0–2 CTA buttons. Variants of the icon nudge
 * recognisability per vertical without shipping a heavy illustration
 * library.
 */
export function EmptyState({
  icon = "default",
  title,
  description,
  actions = [],
  compact = false,
}: {
  icon?: EmptyStateIcon;
  title: string;
  description?: ReactNode;
  actions?: EmptyStateAction[];
  /** Skip the SVG + tighten padding when used inline (e.g. inside a card). */
  compact?: boolean;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: compact ? "1.5rem 1rem" : "2.7rem 1.25rem",
        color: "var(--shell-muted)",
      }}
    >
      {!compact ? <Icon kind={icon} /> : null}
      <div
        style={{
          fontSize: "1.05rem",
          fontWeight: 800,
          color: "var(--shell-fg)",
          marginTop: compact ? 0 : "0.85rem",
          marginBottom: "0.4rem",
        }}
      >
        {title}
      </div>
      {description ? (
        <div
          style={{
            fontSize: "0.88rem",
            lineHeight: 1.6,
            maxWidth: 460,
            margin: "0 auto 1rem",
          }}
        >
          {description}
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div
          style={{
            display: "inline-flex",
            gap: "0.55rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {actions.map((a) => (
            <Action key={a.label} action={a} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Action({ action }: { action: EmptyStateAction }) {
  const variant = action.variant ?? "primary";
  const style: React.CSSProperties = {
    padding: "0.62rem 1rem",
    borderRadius: 999,
    fontSize: "0.84rem",
    fontWeight: 800,
    textDecoration: "none",
    cursor: "pointer",
    display: "inline-block",
    border:
      variant === "primary"
        ? "1px solid #0f172a"
        : "1px solid var(--shell-border)",
    background:
      variant === "primary" ? "#0f172a" : "rgba(255,255,255,0.78)",
    color: variant === "primary" ? "#fff" : "var(--shell-fg)",
  };
  if (action.href) {
    return (
      <Link href={action.href} style={style}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} style={style}>
      {action.label}
    </button>
  );
}

function Icon({ kind }: { kind: EmptyStateIcon }) {
  const common = {
    width: 56,
    height: 56,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { color: "var(--brand-blue)", display: "inline-block" },
    "aria-hidden": true,
  };
  switch (kind) {
    case "events":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case "auctions":
      return (
        <svg {...common}>
          <path d="M14 2L5 11l4 4 9-9-4-4z" />
          <path d="M11 14l-4 4-3-3 4-4" />
          <path d="M3 22h18" />
        </svg>
      );
    case "rentals":
      return (
        <svg {...common}>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 9v12h14V9" />
          <path d="M10 21v-6h4v6" />
        </svg>
      );
    case "properties":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case "resale":
      return (
        <svg {...common}>
          <path d="M17 2l4 4-4 4" />
          <path d="M3 10V8a4 4 0 014-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 14v2a4 4 0 01-4 4H3" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
        </svg>
      );
  }
}
