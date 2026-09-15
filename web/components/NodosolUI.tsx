import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section style={pageHeaderStyle}>
      <div>
        {eyebrow ? <div style={eyebrowStyle}>{eyebrow}</div> : null}
        <h1 style={titleStyle}>{title}</h1>
        {description ? <p style={descriptionStyle}>{description}</p> : null}
      </div>
      {actions ? <div style={actionsStyle}>{actions}</div> : null}
    </section>
  );
}

export function SectionCard({
  children,
  elevated = false,
}: {
  children: ReactNode;
  elevated?: boolean;
}) {
  return (
    <section
      style={{
        ...sectionCardStyle,
        boxShadow: elevated ? "var(--brand-shadow)" : "0 12px 38px rgba(15, 23, 42, 0.05)",
      }}
    >
      {children}
    </section>
  );
}

export function DataCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "blue" | "green" | "amber";
}) {
  const accent = toneColor[tone];
  return (
    <div style={dataCardStyle}>
      <div style={{ ...dataLabelStyle, color: accent }}>{label}</div>
      <div style={dataValueStyle}>{value}</div>
      {sub ? <div style={dataSubStyle}>{sub}</div> : null}
    </div>
  );
}

export function ActionLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link href={href} style={actionStyle(variant)}>
      {children}
    </Link>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber";
}) {
  const accent = toneColor[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.38rem",
        padding: "0.28rem 0.58rem",
        borderRadius: 999,
        border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
        color: accent,
        fontSize: "0.72rem",
        fontWeight: 780,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: accent }}
      />
      {children}
    </span>
  );
}

const toneColor = {
  neutral: "var(--shell-muted)",
  blue: "var(--shell-link)",
  green: "var(--brand-green)",
  amber: "#f59e0b",
} satisfies Record<string, string>;

const pageHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "1.5rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--shell-card) 94%, transparent), color-mix(in srgb, var(--shell-card-alt) 88%, transparent))",
  boxShadow: "var(--brand-shadow)",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--shell-link)",
  fontSize: "0.75rem",
  fontWeight: 780,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "0.55rem",
};

const titleStyle: CSSProperties = {
  fontSize: "2rem",
  lineHeight: 1.1,
  letterSpacing: 0,
  color: "var(--shell-fg)",
  marginBottom: "0.55rem",
};

const descriptionStyle: CSSProperties = {
  color: "var(--shell-muted)",
  maxWidth: 720,
  lineHeight: 1.65,
  fontSize: "0.98rem",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const sectionCardStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 16,
  background: "var(--shell-card)",
  padding: "1.25rem",
};

const dataCardStyle: CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: 14,
  background: "var(--shell-card)",
  padding: "1rem",
};

const dataLabelStyle: CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 780,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "0.4rem",
};

const dataValueStyle: CSSProperties = {
  color: "var(--shell-fg)",
  fontSize: "1.45rem",
  fontWeight: 800,
  letterSpacing: 0,
};

const dataSubStyle: CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.78rem",
  marginTop: "0.25rem",
};

function actionStyle(variant: "primary" | "secondary" | "ghost"): CSSProperties {
  if (variant === "ghost") {
    return {
      color: "var(--shell-muted)",
      fontSize: "0.86rem",
      fontWeight: 720,
      textDecoration: "none",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    padding: "0 1rem",
    borderRadius: 999,
    border: variant === "primary" ? "1px solid #0f172a" : "1px solid var(--shell-border)",
    background: variant === "primary" ? "#0f172a" : "var(--shell-card)",
    color: variant === "primary" ? "#fff" : "var(--shell-fg)",
    textDecoration: "none",
    fontWeight: 760,
    fontSize: "0.86rem",
    whiteSpace: "nowrap",
  };
}
