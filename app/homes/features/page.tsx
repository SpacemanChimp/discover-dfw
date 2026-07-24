import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getMlsProvider, isLiveMls } from "@/lib/mls";
import { FEATURES, FEATURE_SLUGS, featurePath, publishedCitiesFor } from "@/lib/mls/feature-search";
import { bySlug } from "@/lib/dfw-data";
import { SITE_URL } from "@/lib/site";
import SearchNav from "@/components/search/SearchNav";
import Footer from "@/components/Footer";

/* /homes/features — the restrained hub for the feature searches. A short
   directory in the field-guide voice: the six structured-field searches
   with live counts, the standing Land and New Builds searches, and the
   registry-approved city pages. No hero art, no marketing band. */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Search DFW Homes by Feature - Pools, Acreage, Garages | Discover DFW" },
  description:
    "Six structured MLS searches for the things buyers actually hunt: pools, acreage, 3-car garages, single-story plans, 5+ bedrooms, and open houses across DFW.",
  alternates: { canonical: "/homes/features" },
  robots: { index: isLiveMls, follow: true },
};

const cachedCount = (slug: (typeof FEATURE_SLUGS)[number]) =>
  unstable_cache(
    async () => {
      try {
        const r = await getMlsProvider().searchListings({ ...FEATURES[slug].filters, pageSize: 1 });
        return r.total;
      } catch {
        return null; // counts are decoration on the hub — never fail the page
      }
    },
    ["feature-hub-count", slug],
    { revalidate: 3600 }
  )();

export default async function FeatureHubPage() {
  const counts = Object.fromEntries(
    await Promise.all(FEATURE_SLUGS.map(async (s) => [s, isLiveMls ? await cachedCount(s) : null]))
  ) as Record<string, number | null>;

  const jsonLd = isLiveMls
    ? [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Search DFW homes by feature",
          description:
            "Structured MLS searches for pools, acreage, 3-car garages, single-story homes, 5+ bedrooms, and open houses across Dallas-Fort Worth.",
          url: `${SITE_URL}/homes/features`,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Discover DFW", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Home Features", item: `${SITE_URL}/homes/features` },
          ],
        },
      ]
    : null;

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <SearchNav active="homes" />
      <main style={{ padding: "34px 4vw 70px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17" }}>
          THE FIELD GUIDE — SEARCH BY WHAT MATTERS
        </div>
        <h1 className="font-serif" style={{ fontWeight: 900, fontSize: "clamp(26px,3.4vw,40px)", margin: "8px 0 10px" }}>
          Search DFW homes by feature
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, maxWidth: 720, color: "rgba(29,25,19,.78)" }}>
          Each search below matches a structured MLS field, never keywords scraped from listing descriptions. Counts are
          live on-market totals, which include active, under-contract, coming-soon, and pending homes.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14, margin: "26px 0" }}>
          {FEATURE_SLUGS.map((slug) => {
            const def = FEATURES[slug];
            const cities = publishedCitiesFor(slug);
            return (
              <section key={slug} style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#FBF7EE", padding: "16px 18px" }}>
                <Link href={featurePath(slug)} style={{ textDecoration: "none", color: "#1D1913" }}>
                  <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>{def.h1}</h2>
                </Link>
                {counts[slug] != null && (
                  <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", marginTop: 6 }}>
                    {counts[slug]!.toLocaleString()} MATCHING ON-MARKET LISTINGS
                  </div>
                )}
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.72)", margin: "8px 0 10px" }}>{def.fieldNote}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link href={featurePath(slug)} className="font-mono" style={chip(true)}>ALL OF DFW →</Link>
                  {cities.map((c) => (
                    <Link key={c} href={featurePath(slug, c)} className="font-mono" style={chip()}>
                      {(bySlug[c]?.name ?? c).toUpperCase()}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 20, margin: "8px 0 10px" }}>Standing searches</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/land" className="font-mono" style={chip(true)}>DFW LAND FOR SALE →</Link>
          <Link href="/new-builds" className="font-mono" style={chip(true)}>NEW CONSTRUCTION →</Link>
          <Link href="/homes" className="font-mono" style={chip(true)}>THE MAP ROOM →</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function chip(primary = false): React.CSSProperties {
  return {
    border: `1.5px solid ${primary ? "#1D1913" : "rgba(29,25,19,.35)"}`,
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".12em",
    textDecoration: "none",
    color: "#1D1913",
    background: primary ? "#F6F1E6" : "#FBF7EE",
    whiteSpace: "nowrap",
  };
}
