import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reads happen at request time inside <Suspense>; nothing about the stack is prerendered (D6).
  cacheComponents: true,
  partialPrefetching: true,
  // The image runs `node server.js` from .next/standalone (deploy/console/Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  // docs/FRONTEND.md already says to read node_modules/next/dist/docs; do not write web/AGENTS.md on `next dev`.
  agentRules: false,
};

export default nextConfig;
