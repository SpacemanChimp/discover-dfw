import { fileURLToPath } from "url";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: a stray package-lock.json in the user profile
  // otherwise makes Next infer C:\Users\Apple as the project root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};
export default nextConfig;
