"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CreatorProfileRow,
  ListProfilesResult,
  ListSort,
  listProfiles,
} from "@/lib/creatorProfile";

const SORT_LABELS: Array<{ key: ListSort; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "recent", label: "Recently active" },
  { key: "handle", label: "A → Z" },
];

export function CreatorsView({
  initialQuery,
  initialSort,
  initialPage,
  initialResult,
  basePath = "/creators",
}: {
  initialQuery: string;
  initialSort: ListSort;
  initialPage: number;
  initialResult: ListProfilesResult;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<ListSort>(initialSort);
  const [page, setPage] = useState<number>(initialPage);
  const [result, setResult] = useState<ListProfilesResult>(initialResult);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const lastFetchKey = useRef<string>(`${initialQuery}|${initialSort}|${initialPage}`);

  // Push query/sort/page into URL params (deep-linkable).
  const syncUrl = useCallback(
    (q: string, s: ListSort, p: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q);
      else params.delete("q");
      if (s !== "newest") params.set("sort", s);
      else params.delete("sort");
      if (p > 1) params.set("page", String(p));
      else params.delete("page");
      const next = params.toString();
      router.replace(next ? `${basePath}?${next}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams]
  );

  const reload = useCallback(
    async (q: string, s: ListSort, p: number) => {
      const key = `${q}|${s}|${p}`;
      lastFetchKey.current = key;
      setBusy(true);
      try {
        const next = await listProfiles({ query: q, sort: s, page: p, pageSize: 20 });
        if (lastFetchKey.current === key) {
          setResult(next);
        }
      } finally {
        if (lastFetchKey.current === key) setBusy(false);
      }
    },
    []
  );

  // Debounced query change.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      syncUrl(query, sort, 1);
      void reload(query, sort, 1);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, reload, sort, syncUrl]);

  function changeSort(next: ListSort) {
    setSort(next);
    setPage(1);
    syncUrl(query, next, 1);
    void reload(query, next, 1);
  }

  function goToPage(next: number) {
    if (next < 1 || (next - 1) * result.pageSize >= result.total) return;
    setPage(next);
    syncUrl(query, sort, next);
    void reload(query, sort, next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(result.total / result.pageSize)),
    [result.total, result.pageSize]
  );

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={H1}>Creators</h1>
        <p style={SUBTITLE}>
          Browse public Nodosol creator profiles. Tap any handle to tip,
          subscribe, or buy a ticket.
        </p>
      </header>

      <div style={CONTROLS}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search handle or display name…"
          style={SEARCH_INPUT}
          spellCheck={false}
          maxLength={80}
        />
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {SORT_LABELS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => changeSort(s.key)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: 999,
                border: "1px solid",
                borderColor: sort === s.key ? "var(--shell-link)" : "var(--shell-border)",
                background: sort === s.key ? "rgba(79,70,229,0.12)" : "transparent",
                color: sort === s.key ? "var(--shell-link)" : "var(--shell-muted)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: "1rem", fontSize: "0.78rem", color: "var(--shell-muted)" }}>
        {busy
          ? "Loading…"
          : result.total === 0
            ? query
              ? `No creators match “${query}”.`
              : "No creators yet."
            : `${result.total} creator${result.total === 1 ? "" : "s"}`}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div style={GRID}>
          {result.rows.map((row) => (
            <CreatorCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav style={PAGINATION} aria-label="Pagination">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || busy}
            style={pageBtnStyle(page <= 1)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: "0.82rem", color: "var(--shell-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || busy}
            style={pageBtnStyle(page >= totalPages)}
          >
            Next →
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function CreatorCard({ row }: { row: CreatorProfileRow }) {
  const handleHref = `/c/${row.handle}`;
  const initials = (row.display_name?.trim() || row.handle).slice(0, 2).toUpperCase();
  return (
    <Link href={handleHref} style={CARD_LINK}>
      <div style={CARD}>
        <div style={CARD_HEAD}>
          {row.avatar_url ? (
            // Allow remote avatars; <img> is fine since we don't yet
            // have the next/image remote pattern wired for arbitrary hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.avatar_url}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              style={AVATAR_IMG}
            />
          ) : (
            <div style={AVATAR_FALLBACK}>{initials}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={DISPLAY_NAME}>{row.display_name?.trim() || `@${row.handle}`}</div>
            <div style={HANDLE}>@{row.handle}</div>
          </div>
        </div>
        {row.bio ? <div style={BIO}>{truncate(row.bio, 140)}</div> : null}
        <div style={CARD_FOOT}>
          <span style={META_PILL}>
            Joined {formatJoined(row.created_at)}
          </span>
          {row.twitter ? <span style={META_PILL}>𝕏</span> : null}
          {row.website ? <span style={META_PILL}>web</span> : null}
          {row.discord ? <span style={META_PILL}>discord</span> : null}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div style={EMPTY_BOX}>
      <div style={EMPTY_TITLE}>
        {query ? "No matches" : "Be the first creator on Nodosol"}
      </div>
      <p style={EMPTY_BODY}>
        {query
          ? "Try a different search term, or "
          : "Claim your handle to start receiving tips, ticket sales, and subscriptions. "}
        <Link href="/creator/profile" style={{ color: "var(--shell-link)", textDecoration: "underline" }}>
          set up your profile
        </Link>
        .
      </p>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const days = Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const H1: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 700,
  letterSpacing: "-0.015em",
  color: "var(--shell-fg)",
  marginBottom: "0.4rem",
};

const SUBTITLE: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.95rem",
  lineHeight: 1.5,
  maxWidth: 620,
};

const CONTROLS: React.CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: "0.6rem",
};

const SEARCH_INPUT: React.CSSProperties = {
  flex: "1 1 240px",
  minWidth: 200,
  padding: "0.6rem 0.9rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 10,
  background: "var(--shell-input-bg)",
  color: "var(--shell-fg)",
  fontSize: "0.9rem",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "0.85rem",
};

const CARD_LINK: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "inherit",
};

const CARD: React.CSSProperties = {
  padding: "1rem 1.05rem",
  border: "1px solid var(--shell-border)",
  borderRadius: 12,
  background: "var(--shell-card-bg)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  height: "100%",
  transition: "border-color 0.15s, transform 0.15s",
};

const CARD_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.7rem",
  minWidth: 0,
};

const AVATAR_IMG: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  objectFit: "cover" as const,
  flex: "0 0 44px",
  border: "1px solid var(--shell-border)",
};

const AVATAR_FALLBACK: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "var(--shell-pill-bg)",
  color: "var(--shell-fg)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.86rem",
  fontWeight: 700,
  flex: "0 0 44px",
  border: "1px solid var(--shell-border)",
};

const DISPLAY_NAME: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "0.95rem",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const HANDLE: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.78rem",
};

const BIO: React.CSSProperties = {
  fontSize: "0.84rem",
  color: "var(--shell-muted)",
  lineHeight: 1.45,
  display: "-webkit-box" as React.CSSProperties["display"],
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const CARD_FOOT: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
  marginTop: "auto",
};

const META_PILL: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--shell-faint)",
  background: "var(--shell-pill-bg)",
  border: "1px solid var(--shell-border)",
  padding: "0.18rem 0.45rem",
  borderRadius: 999,
};

const PAGINATION: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85rem",
  marginTop: "1.5rem",
};

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.45rem 0.95rem",
    background: "transparent",
    color: disabled ? "var(--shell-faint)" : "var(--shell-fg)",
    border: "1px solid var(--shell-border)",
    borderRadius: 8,
    fontSize: "0.85rem",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

const EMPTY_BOX: React.CSSProperties = {
  border: "1px dashed var(--shell-border)",
  borderRadius: 12,
  padding: "2rem 1.5rem",
  textAlign: "center" as const,
  background: "var(--shell-card-bg)",
};

const EMPTY_TITLE: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  marginBottom: "0.5rem",
  color: "var(--shell-fg)",
};

const EMPTY_BODY: React.CSSProperties = {
  color: "var(--shell-muted)",
  fontSize: "0.9rem",
  lineHeight: 1.5,
  maxWidth: 480,
  margin: "0 auto",
};
