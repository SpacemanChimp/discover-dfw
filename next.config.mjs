import { fileURLToPath } from "url";
import path from "path";

/* The retired staging hostname Google indexed. EXACT host match only:
   ordinary per-deployment preview hostnames (discover-dfw-git-*, hashed
   *.vercel.app) never match, and local dev hosts never match. Exported
   for scripts/tests/staging-redirect.test.mjs. */
export const STAGING_HOST = "discover-dfw.vercel.app";
export const PRODUCTION_ORIGIN = "https://www.discoverdfw.com";

/* Production maps REQUIRE the MapTiler key at build time (it's inlined
   into the client bundle). The OpenStreetMap fallback exists for local
   development and previews only — OSM's public tile servers are not an
   SLA-backed production dependency, and their usage policy is written for
   light use. Failing the build beats shipping a production deploy on a
   best-effort tile source. */
if (process.env.VERCEL_ENV === "production" && !process.env.NEXT_PUBLIC_MAPTILER_KEY) {
  throw new Error(
    "NEXT_PUBLIC_MAPTILER_KEY is required for production builds — add it in " +
      "Vercel → Settings → Environment Variables (Production) before deploying. " +
      "Search maps refuse to ship on the OpenStreetMap fallback in production."
  );
}

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
  async headers() {
    // every non-production deployment (previews, and any future staging)
    // is stamped noindex on EVERY path via a response header — reliable
    // regardless of per-page meta, and evaluated at build time when
    // Vercel sets VERCEL_ENV per deployment. Ordinary branch previews
    // stay reachable and testable (Vercel Authentication in front),
    // never indexed, and never redirected. Local dev (VERCEL_ENV unset)
    // gets the header too, harmlessly. Canonical tags keep pointing at
    // the production domain everywhere — a preview never claims itself.
    if (process.env.VERCEL_ENV === "production") return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
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
