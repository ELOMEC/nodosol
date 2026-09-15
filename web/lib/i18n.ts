"use client";

import { useEffect, useState } from "react";

import enMessages from "@/messages/en.json";
import srMessages from "@/messages/sr.json";

/**
 * Lightweight client-side i18n.
 *
 * Why not next-intl: it ships a server runtime + middleware that
 * conflicts with our existing route layout (per-shell providers,
 * RSC-streamed surfaces, etc.). For a 2-locale Balkan + US scope a
 * 60-line in-house store covers every real need without the route
 * refactor. If we ever ship 5+ locales we can swap to next-intl
 * keyed off this same JSON shape.
 *
 * Locale persists in localStorage; first visit picks SR if the browser
 * language starts with `sr` and EN otherwise. `t("nav.marketplace")`
 * does dot-path lookup with EN fallback if a key is missing in the
 * non-default locale.
 */

export type Locale = "en" | "sr";

export const LOCALES: ReadonlyArray<{ code: Locale; label: string; flag: string }> = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "sr", label: "Srpski", flag: "🇷🇸" },
];

const STORAGE_KEY = "nodosol_locale";
const DEFAULT_LOCALE: Locale = "en";

const messages: Record<Locale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
  sr: srMessages as Record<string, unknown>,
};

const subscribers = new Set<(locale: Locale) => void>();
let currentLocale: Locale | null = null;

function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "sr") return stored;
  } catch {
    // ignore
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    if (navigator.language.toLowerCase().startsWith("sr")) return "sr";
  }
  return DEFAULT_LOCALE;
}

export function getLocale(): Locale {
  if (currentLocale) return currentLocale;
  currentLocale = detectLocale();
  return currentLocale;
}

export function setLocale(next: Locale): void {
  currentLocale = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      // ignore
    }
  }
  for (const cb of subscribers) cb(next);
}

function lookup(bag: Record<string, unknown>, key: string): string | null {
  const parts = key.split(".");
  let cur: unknown = bag;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return typeof cur === "string" ? cur : null;
}

/**
 * Direct (non-reactive) translation lookup. Falls back to EN, then to
 * the key itself so missing strings are visible during development.
 */
export function tr(locale: Locale, key: string, fallback?: string): string {
  return (
    lookup(messages[locale], key) ??
    lookup(messages.en, key) ??
    fallback ??
    key
  );
}

/**
 * React hook: returns `[locale, t, setLocale]`. Re-renders on locale
 * change so existing screens flip without a reload.
 */
export function useI18n(): [Locale, (key: string, fallback?: string) => string, (l: Locale) => void] {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  useEffect(() => {
    const cb = (next: Locale) => setLocaleState(next);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  const t = (key: string, fallback?: string) => tr(locale, key, fallback);
  return [locale, t, setLocale];
}
