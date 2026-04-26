// Server component (no "use client") so the GitHub fetch happens on the
// edge and the response can be cached for 1 hour. Renders three trust
// pills inline in the landing hero.

const GH_REPO = "ELOMEC/nodosol";
const GH_API = `https://api.github.com/repos/${GH_REPO}`;
const SECURITY_RUNBOOK_URL = `https://github.com/${GH_REPO}/blob/main/docs/SECURITY_RUNBOOK.md`;
const GH_REPO_URL = `https://github.com/${GH_REPO}`;

async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch(GH_API, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { stargazers_count?: number };
    return typeof json.stargazers_count === "number" ? json.stargazers_count : null;
  } catch {
    return null;
  }
}

export async function TrustSignals() {
  const stars = await fetchStarCount();

  return (
    <div style={WRAP}>
      <span style={pillStyle("warn")}>
        <span style={DOT_AMBER} /> Audit pending — OtterSec
      </span>
      <a href={SECURITY_RUNBOOK_URL} target="_blank" rel="noreferrer" style={pillStyle("info")}>
        <span style={DOT_INDIGO} /> Squads 2-of-3 multisig
        <span style={ARROW}>↗</span>
      </a>
      {stars !== null ? (
        <a href={GH_REPO_URL} target="_blank" rel="noreferrer" style={pillStyle("muted")}>
          <span style={STAR}>★</span>
          {stars.toLocaleString()} · GitHub
          <span style={ARROW}>↗</span>
        </a>
      ) : null}
    </div>
  );
}

const WRAP: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginBottom: "1.75rem",
};

function pillStyle(kind: "warn" | "info" | "muted"): React.CSSProperties {
  const palette = {
    warn: {
      bg: "rgba(245,158,11,0.10)",
      color: "#f5c97a",
      border: "rgba(245,158,11,0.28)",
    },
    info: {
      bg: "rgba(123,156,255,0.10)",
      color: "#a5b4fc",
      border: "rgba(123,156,255,0.28)",
    },
    muted: {
      bg: "rgba(255,255,255,0.04)",
      color: "#c8c8c8",
      border: "rgba(255,255,255,0.10)",
    },
  }[kind];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.78rem",
    fontWeight: 500,
    padding: "0.32rem 0.72rem",
    borderRadius: 999,
    background: palette.bg,
    color: palette.color,
    border: `1px solid ${palette.border}`,
    textDecoration: "none",
  };
}

const DOT_AMBER: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#f59e0b",
};

const DOT_INDIGO: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#6366f1",
};

const STAR: React.CSSProperties = {
  color: "#fbbf24",
};

const ARROW: React.CSSProperties = {
  fontSize: "0.7rem",
  opacity: 0.7,
  marginLeft: "0.1rem",
};
