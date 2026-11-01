import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Pacotes internos do monorepo são consumidos como TypeScript fonte.
  transpilePackages: ["@nexo/shared"],
};

export default nextConfig;
