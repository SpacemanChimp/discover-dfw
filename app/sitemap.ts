import type { MetadataRoute } from "next";
import { cities } from "@/lib/dfw-data";
import { hoodsForCity, canonicalCityForHood } from "@/lib/hoods";
import { isLiveMls } from "@/lib/mls";
import { featureSitemapPaths } from "@/lib/mls/feature-search";
import { SITE_URL } from "@/lib/site";
import { getPublishedPages } from "@/lib/editor/pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/how-we-research`, changeFrequency: "monthly", priority: 0.3 },
  ];
  // search surfaces join the sitemap only once inventory is real —
  // individual /listing/* pages stay out (tens of thousands, high churn)
  if (isLiveMls) {
    entries.push({ url: `${SITE_URL}/homes`, changeFrequency: "daily", priority: 0.9 });
    entries.push({ url: `${SITE_URL}/land`, changeFrequency: "daily", priority: 0.7 });
    entries.push({ url: `${SITE_URL}/new-builds`, changeFrequency: "daily", priority: 0.8 });
    // feature searches: the hub, six metro pages, and ONLY registry-approved
    // city-feature pages (lib/mls/feature-search.ts) — never every combination
    for (const p of featureSitemapPaths()) {
      entries.push({ url: `${SITE_URL}${p}`, changeFrequency: "daily", priority: p === "/homes/features" ? 0.6 : p.split("/").length > 3 ? 0.6 : 0.7 });
    }
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
  // admin-created builder pages — PUBLISHED only (drafts stay invisible).
  // lastModified is set ONLY here, from the real publish timestamp: no
  // other route family has a truthful per-URL source-update date, and a
  // build-time "today" on every URL would be a lie crawlers learn to
  // ignore — so everything else deliberately omits the field.
  for (const p of await getPublishedPages()) {
    entries.push({
      url: `${SITE_URL}/${p.slug}`,
      changeFrequency: "monthly",
      priority: 0.5,
      ...(p.published_at ? { lastModified: new Date(p.published_at) } : {}),
    });
  }
  return entries;
}
