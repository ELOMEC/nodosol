"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Synchronises a piece of state with a URL search-param key.
 *
 * - Initial value: read from `?key=` if present (and matches `allowed`
 *   when supplied), else `defaultValue`.
 * - `setValue` updates local state AND `router.replace`s the URL with
 *   the new value (or removes the key when value === defaultValue, so
 *   share URLs stay clean).
 * - Back/forward navigation (`searchParams` change) is reflected back
 *   into local state without firing a redundant `replace`.
 *
 * Use one hook call per logical key. Multiple keys on a single page
 * compose because each `replace` carries the latest of every other
 * key it doesn't touch.
 */
export function useSearchParamsState<T extends string>(
  key: string,
  defaultValue: T,
  options: { allowed?: readonly T[]; debounceMs?: number } = {},
): [T, (next: T) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowed = options.allowed;
  const debounceMs = options.debounceMs ?? 0;

  const decode = useCallback(
    (raw: string | null): T => {
      if (raw === null || raw === "") return defaultValue;
      if (allowed && !allowed.includes(raw as T)) return defaultValue;
      return raw as T;
    },
    [defaultValue, allowed],
  );

  const initial = decode(searchParams.get(key));
  const [value, setValueState] = useState<T>(initial);
  const lastWritten = useRef<string | null>(searchParams.get(key));
  const debounceRef = useRef<number | null>(null);

  // Reflect URL→state on back/forward navigation. We only update if the
  // URL diverges from the value we last *wrote* — otherwise we'd loop.
  useEffect(() => {
    const raw = searchParams.get(key);
    if (raw === lastWritten.current) return;
    const next = decode(raw);
    if (next !== value) setValueState(next);
    lastWritten.current = raw;
    // Intentionally not depending on `value` — would cause loops with
    // local-only edits. URL is the only source of truth here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, key, decode]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      const apply = () => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === defaultValue) {
          params.delete(key);
        } else {
          params.set(key, next);
        }
        const qs = params.toString();
        const path =
          typeof window !== "undefined" ? window.location.pathname : "/";
        router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
        lastWritten.current = next === defaultValue ? null : next;
      };
      if (debounceMs > 0) {
        if (debounceRef.current !== null) {
          window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(apply, debounceMs);
      } else {
        apply();
      }
    },
    [router, searchParams, key, defaultValue, debounceMs],
  );

  return [value, setValue];
}
