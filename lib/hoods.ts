/* Neighborhood ("hood") layer: slugs, per-city rosters, and editorial content
   for /city/[slug]/[hood] pages. A hood is either an established neighborhood
   from City.hoods or an actively-selling community from newBuilds (or both —
   the union is the page set). */
import { City, cities, newBuilds, NewBuild } from "./dfw-data";
import { slugifyHood } from "./slug";
import contentRaw from "./hood-content.json";

export { slugifyHood };

export interface HoodRef {
  slug: string;
  name: string;
  note: string;
  citySlug: string;
  /** Present when this hood is an actively-selling new-build community. */
  newBuild?: NewBuild;
}

function newBuildByName(name: string): NewBuild | undefined {
  const k = name.toLowerCase();
  return newBuilds.find((nb) => nb.name.toLowerCase() === k);
}

export function hoodsForCity(c: City): HoodRef[] {
  const list: HoodRef[] = c.hoods.map(([name, note]) => ({
    slug: slugifyHood(name),
    name,
    note,
    citySlug: c.slug,
    newBuild: newBuildByName(name),
  }));
  // New-build communities registered to this city but missing from its hood list.
  for (const nb of newBuilds) {
    if (nb.city === c.slug && !list.some((h) => h.slug === slugifyHood(nb.name))) {
      list.push({
        slug: slugifyHood(nb.name),
        name: nb.name,
        note: nb.note,
        citySlug: c.slug,
        newBuild: nb,
      });
    }
  }
  return list;
}

export function findHood(c: City, hoodSlug: string): HoodRef | undefined {
  return hoodsForCity(c).find((h) => h.slug === hoodSlug);
}

/** Cities whose hood roster includes this name (master plans can span towns). */
export function citiesWithHood(name: string): City[] {
  const k = name.toLowerCase();
  return cities.filter(
    (c) =>
      c.hoods.some(([n]) => n.toLowerCase() === k) ||
      newBuilds.some((nb) => nb.city === c.slug && nb.name.toLowerCase() === k)
  );
}

/** The single city slug whose page is the canonical URL for this hood —
    the selling city for new builds, otherwise the first listing city. */
export function canonicalCityForHood(h: HoodRef): string {
  if (h.newBuild) return h.newBuild.city;
  const owners = citiesWithHood(h.name);
  return owners.length ? owners[0].slug : h.citySlug;
}

/* ---- editorial content (generated, verified; see lib/hood-content.json) ---- */
export interface HoodContent {
  tagline: string;
  intro: string[];
  homes: string;
  highlights: { title: string; note: string }[];
  faq: { q: string; a: string }[];
  newBuild?: { amenities: string[]; buyerNotes: string[] };
}

const hoodContent = contentRaw as Record<string, HoodContent>;

/** Editorial content for a hood; falls back to data-derived copy so a page
    never renders empty if a content key is missing. */
export function contentFor(c: City, h: HoodRef): HoodContent {
  const hit = hoodContent[`${c.slug}/${h.slug}`];
  if (hit) return hit;
  return {
    tagline: h.note,
    intro: [
      `${h.name} sits in ${c.name}, ${c.county} County — ${h.note.toLowerCase().replace(/\.$/, "")}. ${c.tagline}.`,
      c.vibe,
    ],
    homes: `Homes in ${h.name} follow ${c.name}'s broader pattern — ${c.tagline.toLowerCase()}. Schools run through ${c.isd}. Figures on this page are placeholders; verify current listings and pricing before you tour.`,
    highlights: [
      { title: "The setting", note: h.note },
      { title: "Schools", note: c.isd },
      { title: "The city", note: c.tagline },
      { title: "The county", note: `${c.county} County, North Texas` },
    ],
    faq: [
      {
        q: `Where is ${h.name}?`,
        a: `${h.name} is a ${h.newBuild ? "new-build community" : "neighborhood"} in ${c.name}, Texas, in ${c.county} County on the ${c.name} side of the Dallas–Fort Worth metroplex.`,
      },
      {
        q: `What school district serves ${h.name}?`,
        a: `${h.name} is served by ${c.isd}. Boundary lines shift, so verify the exact address with the district before writing an offer.`,
      },
    ],
    newBuild: h.newBuild
      ? {
          amenities: [h.newBuild.note],
          buyerNotes: [
            `${h.name} is listed as ${h.newBuild.status.toLowerCase()} with ${h.newBuild.builders} builders active, from the ${h.newBuild.from.replace("$", "$")}. Verify phase availability and pricing with the sales offices.`,
          ],
        }
      : undefined,
  };
}
