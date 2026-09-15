/**
 * Best-effort fetch of Metaplex-style metadata JSON at a given URI, returning
 * the `image` field. Used to resolve card thumbnails across the marketplace,
 * My Assets, Portfolio, and search views.
 *
 * The function tolerates ipfs:// URIs (rewritten to ipfs.io gateway), missing
 * Content-Type headers, and outright fetch failures — callers fall back to a
 * category gradient when the result is `null`.
 */

export function toHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");
  }
  return uri;
}

type JsonMetadata = {
  image?: string;
  description?: string;
  name?: string;
};

/**
 * Fetch the set of unique URIs and return a Map of uri → image URL (or
 * description). Caller passes both Map caches if it wants to preserve state
 * across re-renders; pass empty Maps otherwise.
 *
 * Results are fetched concurrently with `force-cache` so the browser's HTTP
 * cache handles de-dupe / revalidation. Missing / broken URIs simply don't
 * populate the map.
 */
export async function fetchImagesForUris(
  uris: Iterable<string>,
  into?: Map<string, string>
): Promise<Map<string, string>> {
  const out = into ?? new Map<string, string>();
  const unique = Array.from(new Set(Array.from(uris).filter((u) => u.length > 0)));
  await Promise.all(
    unique.map(async (uri) => {
      if (out.has(uri)) return; // cache hit
      try {
        const resp = await fetch(toHttp(uri), { cache: "force-cache" });
        if (!resp.ok) return;
        const json = (await resp.json()) as JsonMetadata;
        if (json.image) out.set(uri, json.image);
      } catch {
        // swallow — card keeps its gradient
      }
    })
  );
  return out;
}
