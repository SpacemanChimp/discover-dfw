/* Canonical site origin for absolute URLs (metadata, sitemap, JSON-LD).
   Override with NEXT_PUBLIC_SITE_URL when the domain changes. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://discover-dfw.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "Discover DFW";
