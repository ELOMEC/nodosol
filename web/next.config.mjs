// L2 — opt-in bundle analyzer.
// Run with `ANALYZE=true npm run build` to open per-route + per-chunk
// reports under .next/analyze/. The dep is required only when the env
// var is set so production builds stay clean if it's not installed.
async function maybeWithAnalyzer(config) {
  if (process.env.ANALYZE !== "true") return config;
  try {
    const mod = await import("@next/bundle-analyzer");
    const withBundleAnalyzer = mod.default({ enabled: true, openAnalyzer: true });
    return withBundleAnalyzer(config);
  } catch {
    console.warn(
      "[next.config] ANALYZE=true but @next/bundle-analyzer not installed — skipping. `npm i -D @next/bundle-analyzer` to enable.",
    );
    return config;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Hosts that ship user-supplied media. The Supabase project hosts
    // creator avatars, banners, asset gallery + auction-metadata
    // covers under the `asset-media` bucket. Helius CDN serves
    // compressed-NFT thumbnails for ticket assets. arweave.net /
    // ipfs.io are common JSON-URI image targets for tokenized assets.
    remotePatterns: [
      { protocol: "https", hostname: "xvgxaodxylrolkpyuszx.supabase.co", pathname: "/storage/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/**" },
      { protocol: "https", hostname: "*.helius-rpc.com" },
      { protocol: "https", hostname: "cdn.helius-rpc.com" },
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "*.arweave.net" },
      { protocol: "https", hostname: "ipfs.io", pathname: "/ipfs/**" },
      { protocol: "https", hostname: "*.ipfs.io" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    // Solana Actions require CORS for wallet adapters (dial.to etc.) to
    // fetch the Action metadata and POST the build-tx requests.
    return [
      {
        source: "/api/actions/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
          },
          { key: "Access-Control-Expose-Headers", value: "X-Action-Version, X-Blockchain-Ids" },
        ],
      },
      {
        source: "/actions.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default await maybeWithAnalyzer(nextConfig);
