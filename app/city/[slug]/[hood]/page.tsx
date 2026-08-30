import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cities, bySlug, countyById, City } from "@/lib/dfw-data";
import { hoodsForCity, findHood, slugifyHood, canonicalCityForHood, contentFor, HoodRef } from "@/lib/hoods";
import { SITE_NAME } from "@/lib/site";
import { getEditorState } from "@/lib/editor/overrides";
import { HoodPageView } from "@/components/hood/HoodPageView";

export function generateStaticParams() {
  return cities.flatMap((c) =>
    hoodsForCity(c).map((h) => ({ slug: c.slug, hood: h.slug }))
  );
}

function resolve(slug: string, hood: string): { c: City; h: HoodRef } | { redirect: string } | null {
  const c = bySlug[slug] || bySlug[slug.toLowerCase()];
  if (!c) return null;
  // Params usually arrive percent-decoded; a stray malformed sequence must
  // 404, not throw a URIError and 500.
  let decoded = hood;
  try {
    decoded = decodeURIComponent(hood);
  } catch {
    /* keep raw segment */
  }
  const exact = c.slug === slug ? findHood(c, decoded) : undefined;
  if (exact) return { c, h: exact };
  // Wrong case / spacing ("Harvest", "FM 407 Corridor") → 308 to the canonical slug.
  const norm = slugifyHood(decoded);
  const match = findHood(c, norm);
  if (match) return { redirect: `/city/${c.slug}/${match.slug}` };
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; hood: string }>;
}): Promise<Metadata> {
  const { slug, hood } = await params;
  const res = resolve(slug, hood);
  if (!res || "redirect" in res) return { title: SITE_NAME };
  const { c, h } = res;
  const county = countyById[c.county];
  const content = contentFor(c, h);
  const nb = h.newBuild;

  /* Precedence: EDITOR-desk published override → CB-3a Content Desk JSON →
     the code formulas below. The canonical stays code-owned regardless. */
  const ed = await getEditorState(`/city/${c.slug}/${h.slug}`);
  const edSeo = ed.regions["intro"];
  const title =
    edSeo?.seoTitle ??
    content.seo?.title ??
    (nb
      ? `${h.name} — New Construction Homes in ${c.name}, TX`
      : `${h.name} — ${c.name}, TX Neighborhood Guide & Homes`);
  const description =
    edSeo?.seoDescription ??
    content.seo?.description ??
    (nb
      ? `${h.name} is a new-build community in ${c.name}, TX (${county.name} County) — ${nb.status.toLowerCase()}, priced from the ${nb.from} with ${nb.builders} active builders. Amenities, buyer resources, schools & FAQs.`
      : `${h.name} neighborhood in ${c.name}, TX (${county.name} County): what it's like to live there, homes & real estate character, ${c.isd} schools, commutes, and FAQs.`);
  const canonicalPath = `/city/${canonicalCityForHood(h)}/${h.slug}`;

  return {
    title,
    description,
    keywords: [
      `${h.name} ${c.name} TX`,
      `homes for sale in ${h.name}`,
      `${h.name} ${c.name} real estate`,
      ...(nb
        ? [
            `new construction ${h.name}`,
            `new build homes ${c.name} TX`,
            `${h.name} builders`,
            `new home communities ${county.name} County`,
          ]
        : [`living in ${h.name}`, `${h.name} neighborhood ${c.name}`]),
      `${c.name} neighborhoods`,
      "DFW real estate",
    ],
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${h.name} · ${c.name}, TX`,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}


export default async function HoodPage({
  params,
}: {
  params: Promise<{ slug: string; hood: string }>;
}) {
  const { slug, hood } = await params;
  const res = resolve(slug, hood);
  if (!res) notFound();
  if ("redirect" in res) permanentRedirect(res.redirect);
  return <HoodPageView c={res.c} h={res.h} />;
}
