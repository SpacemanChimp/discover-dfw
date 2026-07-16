import type { MetadataRoute } from "next";
import { cities } from "@/lib/dfw-data";
import { hoodsForCity, canonicalCityForHood } from "@/lib/hoods";
import { isLiveMls } from "@/lib/mls";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/how-we-research`, changeFrequency: "monthly", priority: 0.3 },
  ];
  // search surfaces join the sitemap only once inventory is real —
  // individual /listing/* pages stay out (tens of thousands, high churn)
  if (isLiveMls) {
    entries.push({ url: `${SITE_URL}/homes`, changeFrequency: "daily", priority: 0.9 });
  }
  for (const c of cities) {
    entries.push({
      url: `${SITE_URL}/city/${c.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    if (isLiveMls) {
      entries.push({
        url: `${SITE_URL}/city/${c.slug}/homes`,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
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
