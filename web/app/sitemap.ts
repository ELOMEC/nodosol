import type { MetadataRoute } from "next";

import { getSupabaseClient } from "@/lib/supabase";

const SITE = "https://nodosol.com";

const STATIC_PATHS: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1.0, freq: "daily" },
  { path: "/welcome", priority: 0.6, freq: "monthly" },
  { path: "/marketplace", priority: 0.9, freq: "daily" },
  { path: "/marketplace/tokenize", priority: 0.7, freq: "weekly" },
  { path: "/marketplace/auctions", priority: 0.8, freq: "daily" },
  { path: "/marketplace/rentals", priority: 0.8, freq: "daily" },
  { path: "/marketplace/events", priority: 0.8, freq: "daily" },
  { path: "/marketplace/properties", priority: 0.7, freq: "daily" },
  { path: "/marketplace/resale", priority: 0.7, freq: "daily" },
  { path: "/marketplace/otc", priority: 0.7, freq: "weekly" },
  { path: "/creators", priority: 0.85, freq: "daily" },
  { path: "/stats", priority: 0.5, freq: "weekly" },
  { path: "/pitch", priority: 0.4, freq: "monthly" },
  { path: "/tech", priority: 0.4, freq: "monthly" },
  { path: "/faq", priority: 0.4, freq: "monthly" },
  { path: "/security", priority: 0.4, freq: "monthly" },
  { path: "/announcements", priority: 0.4, freq: "weekly" },
  { path: "/investors", priority: 0.5, freq: "monthly" },
];

async function fetchCreatorEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("creator_profiles")
      .select("handle, updated_at")
      .order("updated_at", { ascending: false })
      .limit(2000);
    return (data ?? []).map((row) => ({
      url: `${SITE}/c/${row.handle}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: `${SITE}${s.path}`,
    lastModified: now,
    changeFrequency: s.freq,
    priority: s.priority,
  }));

  const creatorEntries = await fetchCreatorEntries();

  return [...staticEntries, ...creatorEntries];
}
