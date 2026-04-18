/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
