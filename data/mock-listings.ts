/* FAKE mock inventory — fictional addresses and prices ported from the
   design bundle's dfw-listings.js, upgraded to the full Listing shape.
   Replaced wholesale by the Trestle provider; nothing here is real. */
import type { Listing, ListingBadge, ListingMedia, PropertyType } from "@/lib/mls/types";

/* Frozen "feed refresh" moment for the whole mock feed. */
export const MOCK_MLS_LAST_UPDATED = "2026-07-01T06:00:00-05:00";
const MOCK_SOURCE = "MOCK";

function media(primary: string, ...rest: string[]): ListingMedia[] {
  return [
    { url: null, caption: primary, order: 0, isPrimary: true },
    ...rest.map((caption, i) => ({ url: null, caption, order: i + 1 })),
  ];
}

interface Spec {
  key: string;
  status?: Listing["standardStatus"];
  badge: ListingBadge;
  price: number;
  wasPrice?: number;
  beds: number;
  baths: number;
  sqft: number;
  lot?: number;
  yr: number;
  type: PropertyType;
  dom: number;
  listDate: string;
  addr: string;
  slug: string;
  cityName: string;
  hood: string;
  zip?: string;
  photos: ListingMedia[];
  photoCount: number;
  note: string;
  featured?: boolean;
}

function listing(s: Spec): Listing {
  return {
    listingKey: `MOCK-${s.key}`,
    listingId: s.key,
    standardStatus: s.status ?? "Active",
    badge: s.badge,
    daysOnMarket: s.dom,
    listDate: s.listDate,
    listPrice: s.price,
    originalListPrice: s.wasPrice,
    bedsTotal: s.beds,
    bathsTotal: s.baths,
    livingAreaSqft: s.sqft,
    lotSizeAcres: s.lot,
    yearBuilt: s.yr,
    propertyType: s.type,
    unparsedAddress: s.addr,
    citySlug: s.slug,
    cityName: s.cityName,
    neighborhood: s.hood,
    postalCode: s.zip,
    media: s.photos,
    photoCount: s.photoCount,
    photoLabel: s.photos[0].caption,
    editorialNote: s.note,
    featured: s.featured,
    listingBrokerName: null,
    listingOfficeName: null,
    mlsSource: MOCK_SOURCE,
    mlsLastUpdated: MOCK_MLS_LAST_UPDATED,
    attributionText: null,
    disclaimerText: null,
  };
}

export const mockListings: Listing[] = [
  listing({
    key: "2214", badge: "NEW", price: 412000, beds: 3, baths: 2, sqft: 1780, lot: 0.19,
    yr: 1938, type: "Bungalow", dom: 4, listDate: "2026-06-27", addr: "1216 W Oak St",
    slug: "denton", cityName: "Denton", hood: "Oak-Hickory district", zip: "76201",
    photos: media("front porch + gables", "original oak floors", "kitchen, new roofline"),
    photoCount: 24, featured: true,
    note: "A 1938 bungalow four blocks off the square — original oak floors, new roof.",
  }),
  listing({
    key: "2189", badge: "OPEN SAT", price: 486000, beds: 4, baths: 3, sqft: 2610, lot: 0.21,
    yr: 2022, type: "Single family", dom: 12, listDate: "2026-06-19", addr: "3405 Ranchman Blvd",
    slug: "denton", cityName: "Denton", hood: "Rayzor Ranch", zip: "76207",
    photos: media("brick elevation, corner lot", "three-car tandem", "open kitchen"),
    photoCount: 31,
    note: "Corner-lot new build with a three-car tandem and a 12-minute walk to the H-E-B.",
  }),
  listing({
    key: "2201", badge: "ACTIVE", price: 615000, beds: 4, baths: 3, sqft: 2980, lot: 0.24,
    yr: 1996, type: "Single family", dom: 22, listDate: "2026-06-09", addr: "18 Compass Ct",
    slug: "rockwall", cityName: "Rockwall", hood: "Chandlers Landing", zip: "75032",
    photos: media("lake view from deck", "gated entry", "primary suite"),
    photoCount: 28, featured: true,
    note: "Sail-club gated original with a Ray Hubbard view from the back deck.",
  }),
  listing({
    key: "2168", badge: "PRICE CUT", price: 559000, wasPrice: 585000, beds: 3, baths: 2.5,
    sqft: 2140, lot: 0.15, yr: 2016, type: "Cottage", dom: 31, listDate: "2026-05-31",
    addr: "512 Travis St", slug: "coppell", cityName: "Coppell", hood: "Old Town Coppell", zip: "75019",
    photos: media("farmhouse porch, picket fence", "farmers market a block away", "porch swing"),
    photoCount: 22,
    note: "Old Town cottage a block from the farmers market — porch swing conveys.",
  }),
  listing({
    key: "2233", badge: "NEW", price: 789000, beds: 3, baths: 2, sqft: 2260, lot: 0.19,
    yr: 1934, type: "Tudor", dom: 2, listDate: "2026-06-29", addr: "6923 Lakeshore Dr",
    slug: "dallas", cityName: "Dallas", hood: "Lakewood", zip: "75214",
    photos: media("brick tudor, arched door", "original hardware", "white rock trail nearby"),
    photoCount: 24, featured: true,
    note: "Storybook Tudor on the White Rock side of Lakewood, unrenovated and honest.",
  }),
  listing({
    key: "2147", badge: "ACTIVE", price: 545000, beds: 3, baths: 2, sqft: 1690, lot: 0.16,
    yr: 1926, type: "Craftsman", dom: 18, listDate: "2026-06-13", addr: "415 N Windomere Ave",
    slug: "dallas", cityName: "Dallas", hood: "Bishop Arts", zip: "75208",
    photos: media("craftsman porch columns", "rebuilt pier-and-beam", "alley ADU potential"),
    photoCount: 19,
    note: "Walk-to-Bishop-Arts craftsman with a rebuilt pier-and-beam and alley ADU potential.",
  }),
  listing({
    key: "2255", badge: "ACTIVE", price: 472000, beds: 4, baths: 2.5, sqft: 2480, lot: 0.18,
    yr: 2019, type: "Single family", dom: 27, listDate: "2026-06-04", addr: "9109 Harborview Dr",
    slug: "rowlett", cityName: "Rowlett", hood: "Bayside", zip: "75088",
    photos: media("peninsula sunset lot", "lake breeze back porch", "DART line ten minutes"),
    photoCount: 26,
    note: "Peninsula streets, lake breeze, and the DART line ten minutes away.",
  }),
  listing({
    key: "2172", badge: "NEW", price: 358000, beds: 4, baths: 2, sqft: 2210, lot: 0.14,
    yr: 2023, type: "Single family", dom: 6, listDate: "2026-06-25", addr: "2317 Trailside Ln",
    slug: "forney", cityName: "Forney", hood: "Gateway Parks", zip: "75126",
    photos: media("new build, amenity lawn", "amenity center two blocks", "open-plan kitchen"),
    photoCount: 18,
    note: "Under $165/sqft with the amenity center two blocks down — the value math writes itself.",
  }),
  listing({
    key: "2140", badge: "ACTIVE", price: 869000, beds: 5, baths: 4, sqft: 3890, lot: 0.42,
    yr: 2004, type: "Custom", dom: 44, listDate: "2026-05-18", addr: "4 Fairway Crossing",
    slug: "heath", cityName: "Heath", hood: "Buffalo Creek", zip: "75032",
    photos: media("fairway custom, live oaks", "yacht club one street over", "study with built-ins"),
    photoCount: 35,
    note: "Fairway custom under mature live oaks, one street off the yacht club.",
  }),
  listing({
    key: "2226", badge: "OPEN SUN", price: 429000, beds: 2, baths: 2, sqft: 1310,
    yr: 2018, type: "High-rise condo", dom: 15, listDate: "2026-06-16",
    addr: "722 Lake Carolyn Pkwy #1104", slug: "irving", cityName: "Irving", hood: "Las Colinas", zip: "75039",
    photos: media("canal view, floor 11", "gondolas below", "amenity deck pool"),
    photoCount: 21,
    note: "Eleventh-floor canal view; gondolas below, DFW Airport ten minutes out.",
  }),
  listing({
    key: "2193", badge: "ACTIVE", price: 445000, beds: 4, baths: 3, sqft: 2560, lot: 0.13,
    yr: 2021, type: "Single family", dom: 20, listDate: "2026-06-11", addr: "1108 Founders Row",
    slug: "midlothian", cityName: "Midlothian", hood: "MidTowne", zip: "76065",
    photos: media("new-urbanist front porch", "walkable to Heritage High", "founders row street"),
    photoCount: 23,
    note: "Front-porch new-urbanist block, walkable to Heritage High.",
  }),
  listing({
    key: "2260", badge: "NEW", price: 398000, beds: 3, baths: 2.5, sqft: 1840,
    yr: 2024, type: "Townhome", dom: 3, listDate: "2026-06-28", addr: "406 Depot Way",
    slug: "sachse", cityName: "Sachse", hood: "The Station", zip: "75048",
    photos: media("townhome row, brick + steel", "district town center", "rooftop line"),
    photoCount: 17,
    note: "Brand-new townhome in the district finally giving Sachse a downtown.",
  }),
];
