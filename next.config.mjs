import { fileURLToPath } from "url";
import path from "path";

/* The retired staging hostname Google indexed. EXACT host match only:
   ordinary per-deployment preview hostnames (discover-dfw-git-*, hashed
   *.vercel.app) never match, and local dev hosts never match. Exported
   for scripts/tests/staging-redirect.test.mjs. */
export const STAGING_HOST = "discover-dfw.vercel.app";
export const PRODUCTION_ORIGIN = "https://www.discoverdfw.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: a stray package-lock.json in the user profile
  // otherwise makes Next infer C:\Users\Apple as the project root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  async redirects() {
    return [
      // permanent (308) hostname redirect: the indexed staging domain →
      // production, preserving pathname and query string
      {
        source: "/:path*",
        has: [{ type: "host", value: STAGING_HOST }],
        destination: `${PRODUCTION_ORIGIN}/:path*`,
        permanent: true,
      },
    ];
  },
  experimental: {
    // Client router cache: reuse dynamic page payloads (filter tweaks,
    // back/forward on /homes) for 30s and static ones for 180s instead of
    // refetching the RSC payload on every navigation.
    staleTimes: { dynamic: 30, static: 180 },
  },
};
export default nextConfig;
