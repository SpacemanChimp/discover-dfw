import type { MetadataRoute } from "next";
import { cities } from "@/lib/dfw-data";
import { hoodsForCity, canonicalCityForHood } from "@/lib/hoods";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  ];
  for (const c of cities) {
    entries.push({
      url: `${SITE_URL}/city/${c.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    for (const h of hoodsForCity(c)) {
      // Cross-listed communities (spanning two cities) canonicalize to one
      // URL — only that URL belongs in the sitemap.
      if (canonicalCityForHood(h) !== c.slug) continue;
      entries.push({
        url: `${SITE_URL}/city/${c.slug}/${h.slug}`,
        changeFrequency: h.newBuild ? "weekly" : "monthly",
        priority: h.newBuild ? 0.7 : 0.6,
      });
    }
  }
  return entries;
}
