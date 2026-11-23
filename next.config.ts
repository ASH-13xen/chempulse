import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Market data changes at most every 3 hours (when the collector runs).
  // Pages are served from cache and refreshed in the background every 10 minutes;
  // the collector also pings /api/revalidate after a run that changed prices.
  cacheLife: {
    market: { stale: 300, revalidate: 600, expire: 86400 },
  },
  // Local-preview mode reads JSON files from data/snapshot; make sure they ship with the server bundle.
  outputFileTracingIncludes: {
    "/**": ["./data/snapshot/**/*", "./config/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
