import { fileURLToPath } from "url";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: a stray package-lock.json in the user profile
  // otherwise makes Next infer C:\Users\Apple as the project root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  experimental: {
    // Client router cache: reuse dynamic page payloads (filter tweaks,
    // back/forward on /homes) for 30s and static ones for 180s instead of
    // refetching the RSC payload on every navigation.
    staleTimes: { dynamic: 30, static: 180 },
  },
};
export default nextConfig;
