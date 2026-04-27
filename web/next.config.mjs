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
    return [
      // Solana Actions require CORS for wallet adapters (dial.to etc.)
      // to fetch the Action metadata and POST the build-tx requests.
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
      // N2 — Security headers + CSP.
      // CSP ships in *report-only* mode first so we can watch the
      // browser console / Vercel logs for unexpected violations from
      // wallet adapters, Privy, or third-party widgets without
      // breaking flows. Flip to `Content-Security-Policy` (strip the
      // -Report-Only suffix) once a week of report-only is clean.
      //
      // Connect-src includes:
      //   - Solana RPC: api.devnet.solana.com + Helius (devnet + mainnet
      //     domains; mainnet ones harmless on devnet).
      //   - Supabase project + storage + edge functions.
      //   - Resend (only used server-side, but listed for safety).
      //   - Privy auth + Cloudflare Turnstile.
      //   - Vercel Insights (perf RUM).
      // Worker-src covers our /sw.js (K2 PWA service worker).
      // Frame-src covers Privy's embedded auth iframe + Turnstile widget.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src * data: blob:",
              "media-src * blob:",
              "font-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              [
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "https://challenges.cloudflare.com",
                "https://*.privy.io https://privy.io",
                "https://*.vercel-insights.com https://*.vercel-scripts.com",
                "https://va.vercel-scripts.com",
                "https://*.googletagmanager.com",
              ].join(" "),
              [
                "connect-src 'self'",
                "https://api.mainnet-beta.solana.com",
                "https://api.devnet.solana.com",
                "https://*.helius-rpc.com",
                "wss://*.helius-rpc.com",
                "https://*.supabase.co wss://*.supabase.co",
                "https://api.resend.com",
                "https://*.privy.io https://privy.io wss://*.privy.io",
                "https://challenges.cloudflare.com",
                "https://*.vercel-insights.com https://*.vercel-scripts.com",
                "https://api.github.com",
                "https://arweave.net https://*.arweave.net",
                "https://ipfs.io https://*.ipfs.io",
                "https://*.google-analytics.com https://*.analytics.google.com",
                "https://*.googletagmanager.com",
              ].join(" "),
              [
                "frame-src 'self'",
                "https://challenges.cloudflare.com",
                "https://*.privy.io https://privy.io",
              ].join(" "),
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default await maybeWithAnalyzer(nextConfig);
