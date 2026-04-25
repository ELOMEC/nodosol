"use client";

import { ChangeEvent } from "react";

export type SortOption<K extends string> = {
  value: K;
  label: string;
};

type Props<K extends string> = {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;

  sortKey?: K;
  sortOptions?: ReadonlyArray<SortOption<K>>;
  onSort?: (v: K) => void;

  priceMin?: string;
  priceMax?: string;
  onPriceMin?: (v: string) => void;
  onPriceMax?: (v: string) => void;
  priceLabel?: string;

  filteredCount?: number;
  totalCount?: number;
  countLabel?: string;
};

export function MarketSearchBar<K extends string>(props: Props<K>) {
  const {
    search,
    onSearch,
    searchPlaceholder = "Search…",
    sortKey,
    sortOptions,
    onSort,
    priceMin,
    priceMax,
    onPriceMin,
    onPriceMax,
    priceLabel = "Price (USDC)",
    filteredCount,
    totalCount,
    countLabel = "items",
  } = props;

  const showPrice = onPriceMin && onPriceMax;
  const showSort = sortOptions && sortOptions.length > 0 && onSort;

  return (
    <div
      style={{
        background: "var(--shell-card)",
        border: "1px solid var(--shell-border)",
        borderRadius: 12,
        padding: "0.85rem 1rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.55rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            background: "var(--shell-card)",
            border: "1px solid var(--shell-border-strong)",
            borderRadius: 7,
            color: "var(--shell-fg)",
            padding: "0.5rem 0.75rem",
            fontSize: "0.86rem",
            outline: "none",
          }}
        />

        {showPrice && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              fontSize: "0.78rem",
              color: "var(--shell-muted)",
            }}
          >
            <span>{priceLabel}:</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="min"
              value={priceMin ?? ""}
              onChange={(e) => onPriceMin?.(e.target.value)}
              style={{ ...numInput, width: 80 }}
            />
            <span style={{ color: "var(--shell-faint)" }}>—</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="max"
              value={priceMax ?? ""}
              onChange={(e) => onPriceMax?.(e.target.value)}
              style={{ ...numInput, width: 80 }}
            />
          </div>
        )}

        {showSort && (
          <select
            value={sortKey}
            onChange={(e) => onSort?.(e.target.value as K)}
            style={selectInput}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {typeof filteredCount === "number" &&
        typeof totalCount === "number" &&
        filteredCount !== totalCount && (
          <div style={{ fontSize: "0.78rem", color: "var(--shell-muted)" }}>
            Showing {filteredCount} of {totalCount} {countLabel}
          </div>
        )}
    </div>
  );
}

const numInput: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 7,
  color: "var(--shell-fg)",
  padding: "0.4rem 0.55rem",
  fontSize: "0.82rem",
  outline: "none",
};

const selectInput: React.CSSProperties = {
  background: "var(--shell-card)",
  border: "1px solid var(--shell-border-strong)",
  borderRadius: 7,
  color: "var(--shell-fg)",
  padding: "0.5rem 0.7rem",
  fontSize: "0.84rem",
  fontWeight: 500,
  outline: "none",
  cursor: "pointer",
};
