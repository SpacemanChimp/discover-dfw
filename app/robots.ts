import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // admin/account surfaces 404 or auth-gate anyway — disallowing them keeps
    // crawlers from wasting budget and keeps private paths out of the index
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
