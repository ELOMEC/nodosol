"use client";

import { LOCALES, useI18n } from "@/lib/i18n";

/**
 * Compact pill-group for switching between English and Serbian.
 * Mounts inside the topbar next to ConnectButton; falls back to a
 * minimal button group on narrow viewports.
 */
export function LocaleToggle() {
  const [locale, , setLocale] = useI18n();
  return (
    <div role="group" aria-label="Language" style={WRAP}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          aria-pressed={l.code === locale}
          title={l.label}
          style={{
            ...BTN,
            background: l.code === locale ? "rgba(123,156,255,0.18)" : "transparent",
            color: l.code === locale ? "#a5b4fc" : "var(--shell-muted, #7c8694)",
            borderColor:
              l.code === locale ? "rgba(123,156,255,0.45)" : "var(--shell-border, #2a2f3a)",
          }}
        >
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const WRAP: React.CSSProperties = {
  display: "inline-flex",
  gap: 2,
  background: "transparent",
};

const BTN: React.CSSProperties = {
  border: "1px solid",
  padding: "0.25rem 0.55rem",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};
