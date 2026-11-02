import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Pacotes internos do monorepo são consumidos como TypeScript fonte.
  transpilePackages: ["@nexo/shared", "@nexo/db", "@nexo/agent", "@nexo/tickets-client"],
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
