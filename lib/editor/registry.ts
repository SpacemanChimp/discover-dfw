/* Editable-region registry — the CODE-OWNED contract of what the EDITOR
   desk may touch. A region exists here or it cannot be edited, previewed,
   or published; everything else on the site (MLS data, market figures,
   filters, map behavior, publication flags, TREC/attribution disclosures,
   navigation, canonicals, auth) stays non-editable by construction.

   Pure data + pure functions (importable by client and server). The
   fallback for every region is the existing code/JSON content — the
   registry only DESCRIBES it; it never replaces it. */

import { cities, type City } from "@/lib/dfw-data";
import { hoodsForCity, canonicalCityForHood } from "@/lib/hoods";
import type { ContentType } from "./doc";

export type PageGroup =
  | "Homepage"
  | "Search & editorial"
  | "Cities"
  | "Neighborhoods"
  | "New-build communities"
  | "Static & research"
  | "Templates"
  | "Site";

export interface RegionDef {
  key: string;
  label: string;
  contentType: ContentType;
  /** inline content images allowed in this region */
  allowImages: boolean;
  /** this region carries the page's editable SEO title/description */
  seoEditable: boolean;
  /** where the fallback lives today — shown in the desk, never executed */
  fallbackSource: string;
}

export interface PageDef {
  route: string;
  title: string;
  group: PageGroup;
  regions: RegionDef[];
  /** exact public paths revalidated when a region on this page publishes */
  revalidatePaths: string[];
}

const rich = (
  key: string,
  label: string,
  fallbackSource: string,
  opts?: { images?: boolean; seo?: boolean }
): RegionDef => ({
  key,
  label,
  contentType: "richtext",
  allowImages: opts?.images ?? false,
  seoEditable: opts?.seo ?? false,
  fallbackSource,
});

const HOME: PageDef = {
  route: "/",
  title: "Homepage",
  group: "Homepage",
  revalidatePaths: ["/"],
  regions: [
    rich("hero-copy", "Hero supporting copy", "components/Hero.tsx (code)"),
    rich("map-intro", "Map introduction", "components/InteractiveMap.tsx (code)"),
    rich("picks-intro", "Editor's Picks introduction", "components/EditorsPicks.tsx (code)"),
    rich("newbuilds-intro", "New Builds introduction", "components/NewBuilds.tsx (code)"),
    rich("cities-intro", "City Index introduction", "components/CityIndex.tsx (code)"),
    rich("newsletter-intro", "Newsletter introduction", "components/Newsletter.tsx (code)"),
    rich("about-copy", "About / research copy", "components/About.tsx (code)"),
  ],
};

const LAND: PageDef = {
  route: "/land",
  title: "Land for Sale",
  group: "Search & editorial",
  revalidatePaths: ["/land"],
  regions: [
    rich("intro", "Introduction under the H1", "components/search/LandRoom.tsx (code)"),
    rich("guide", "Buyer-education guide (below results)", "components/search/LandDueDiligence.tsx (code)", { images: true }),
  ],
};

const NEW_BUILDS: PageDef = {
  route: "/new-builds",
  title: "New Construction",
  group: "Search & editorial",
  revalidatePaths: ["/new-builds"],
  regions: [
    rich("intro", "Introduction under the H1", "components/search/NewBuildsRoom.tsx (code)"),
    rich("guide", "Buyer-education guide (below directory)", "components/search/NewBuildEducation.tsx (code)", { images: true }),
  ],
};

const HOW_WE_RESEARCH: PageDef = {
  route: "/how-we-research",
  title: "How We Research",
  group: "Static & research",
  revalidatePaths: ["/how-we-research"],
  regions: [
    rich("intro", "Lead editorial paragraph", "app/how-we-research/page.tsx (code)"),
  ],
};

function cityPage(c: City): PageDef {
  return {
    route: `/city/${c.slug}`,
    title: `${c.name} — city report`,
    group: "Cities",
    revalidatePaths: [`/city/${c.slug}`],
    regions: [
      rich("intro", "Editorial introduction", "app/city/[slug]/page.tsx + lib/dfw.data.json", {
        images: true,
        seo: true,
      }),
    ],
  };
}

function hoodPage(c: City, h: { slug: string; name: string; newBuild?: unknown }): PageDef {
  const nb = !!h.newBuild;
  const fallback = "lib/hood-content.json → contentFor() formula (code)";
  const regions: RegionDef[] = [
    { key: "tagline", label: "Tagline", contentType: "text", allowImages: false, seoEditable: false, fallbackSource: fallback },
    rich("intro", "Introduction", fallback, { images: true, seo: true }),
    { key: "faq", label: "FAQs (drives FAQPage JSON-LD)", contentType: "faq", allowImages: false, seoEditable: false, fallbackSource: fallback },
  ];
  if (nb) {
    regions.push(rich("amenities", "Amenities (write as a bullet list)", fallback));
    regions.push(rich("buyer-notes", "Buyer notes (write as a bullet list)", fallback));
  } else {
    regions.push(rich("homes", "Homes & real-estate copy", fallback));
  }
  return {
    route: `/city/${c.slug}/${h.slug}`,
    title: `${h.name} · ${c.name}${nb ? " — new build" : ""}`,
    group: nb ? "New-build communities" : "Neighborhoods",
    revalidatePaths: [`/city/${c.slug}/${h.slug}`],
    regions,
  };
}

/** Visual-Builder layout region — present on every builder-capable page.
    The CONTENT desk hides it; the builder edits it. */
const layoutRegion: RegionDef = {
  key: "__layout",
  label: "Page layout (Visual Builder)",
  contentType: "layout",
  allowImages: true,
  seoEditable: false,
  fallbackSource: "code-owned section order",
};

/** shared dynamic templates — one layout document drives every page using
    the template. Publishing requires the typed confirmation. */
const TEMPLATE_PAGES: PageDef[] = [
  {
    route: "template:city",
    title: "City template — ALL 90 city reports",
    group: "Templates",
    revalidatePaths: ["/city/[slug]"],
    regions: [layoutRegion],
  },
  {
    route: "template:hood",
    title: "Hood template — ALL neighborhood & community pages",
    group: "Templates",
    revalidatePaths: ["/city/[slug]/[hood]"],
    regions: [layoutRegion],
  },
];

/** the site navigation document (independently versioned + audited) */
const SITE_NAV_PAGE: PageDef = {
  route: "__site",
  title: "Site navigation",
  group: "Site",
  revalidatePaths: ["/", "/how-we-research"],
  regions: [
    {
      key: "nav",
      label: "Navigation (displayed + hidden)",
      contentType: "nav",
      allowImages: false,
      seoEditable: false,
      fallbackSource: "components/Nav.tsx LINKS (code)",
    },
  ],
};

let _pages: PageDef[] | null = null;
let _byRoute: Map<string, PageDef> | null = null;

export function allPages(): PageDef[] {
  if (_pages) return _pages;
  const out: PageDef[] = [
    { ...HOME, regions: [...HOME.regions, layoutRegion] },
    { ...LAND, regions: [...LAND.regions, layoutRegion] },
    { ...NEW_BUILDS, regions: [...NEW_BUILDS.regions, layoutRegion] },
    { ...HOW_WE_RESEARCH, regions: [...HOW_WE_RESEARCH.regions, layoutRegion] },
    ...TEMPLATE_PAGES,
    SITE_NAV_PAGE,
  ];
  for (const c of cities) {
    out.push(cityPage(c));
    for (const h of hoodsForCity(c)) {
      // cross-listed communities canonicalize to one city — only that route
      // is editable, matching the sitemap policy
      if (canonicalCityForHood(h) !== c.slug) continue;
      out.push(hoodPage(c, h));
    }
  }
  _pages = out;
  return out;
}

export function pageByRoute(route: string): PageDef | undefined {
  if (!_byRoute) {
    _byRoute = new Map(allPages().map((p) => [p.route, p]));
  }
  return _byRoute.get(route);
}

export function regionDef(route: string, regionKey: string): RegionDef | undefined {
  return pageByRoute(route)?.regions.find((r) => r.key === regionKey);
}
