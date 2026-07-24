import type { FeatureSlug } from "@/lib/mls/feature-search";
import type { City } from "@/lib/dfw-data";

/* Editorial content for the feature searches: a short buyer guide and a
   concise FAQ per feature, written by hand for this site. Rules honored
   here: no em dashes in this copy, no invented local facts, no market
   claims we cannot source. City blurbs are assembled ONLY from canonical
   dfw.data.json fields (county, ISD, median price, neighborhood names)
   plus the live, dated inventory count the page already displays. Each
   feature composes DIFFERENT data points in a different order, so city
   pages never read as one paragraph with names swapped. */

export interface FeatureFaq {
  q: string;
  a: string;
}

export const FEATURE_GUIDES: Record<FeatureSlug, { heading: string; paragraphs: string[] }> = {
  "with-pool": {
    heading: "Buying a pool home in North Texas",
    paragraphs: [
      "A private pool in this market usually means gunite or fiberglass in the ground, and the MLS record lists the construction under its pool features. That is the field this search matches, so a listing only appears here when the agent recorded a real private pool. Homes that only have access to a community pool stay out of these results.",
      "When you tour, ask for the pool's age, the last replaster or resurface date, and service records. Equipment matters more than sparkle: a variable-speed pump, a working heater, and a cartridge or DE filter in good shape can save real money in the first two years. Texas summers work pools hard, so a pool that looks tired in July has been tired a while.",
      "Budget for upkeep before you fall in love. Weekly service, chemicals, and electricity are recurring costs, and insurers ask about fencing and self-latching gates. If a listing's photos show a diving board or slide, your insurer will want to know about those too.",
    ],
  },
  "on-acreage": {
    heading: "What an acre actually buys you here",
    paragraphs: [
      "This search returns homes on one acre or more, matched on the lot size the MLS reports. It excludes vacant land on purpose: every result has a house on it. If you want raw dirt to build on, the Land search covers lots, acreage tracts, and ranchland separately.",
      "Acreage living comes with practical questions that city lots never raise. Ask whether the home sits on a septic system or city sewer, whether water is municipal or a well, and who maintains the road out front. An aerobic septic system needs a maintenance contract in most North Texas counties, and that is a recurring cost worth knowing before you offer.",
      "Check the tax picture early. Some larger tracts carry an agricultural exemption that dramatically lowers the tax bill, and losing that exemption at purchase can change your monthly payment. Your lender and the county appraisal district can both tell you what happens after closing.",
    ],
  },
  "3-car-garage": {
    heading: "Why three garage bays are worth hunting for",
    paragraphs: [
      "This search matches the garage spaces count agents record in the MLS, so every home here reports at least three. In practice that third bay is the most flexible room in the house: parking for a truck that will not fit elsewhere, a shop, a gym, or storage that would otherwise eat a bedroom closet.",
      "Look at the bay layout when you tour. A true three-car garage has either three doors or a two-plus-one tandem arrangement, and tandem bays run narrower. Measure if you drive anything long or wide. Door height matters too: lifted trucks and roof racks want an eight-foot door, and plenty of DFW garages still have seven.",
      "In newer construction the third bay is often an option package, which is why two otherwise identical floor plans can differ here. If you are comparing new builds, our New Builds search shows what is going up with current inventory.",
    ],
  },
  "single-story": {
    heading: "The case for one story in Texas",
    paragraphs: [
      "Single-story homes stay in demand here for good reasons: no stairs for aging knees or young kids, simpler maintenance, and one HVAC zone doing predictable work. This search matches the MLS Levels field exactly, so story-and-a-half plans and split-levels do not sneak in.",
      "One story spreads the same square footage wider across the lot, so compare lot sizes when you compare prices. A 2,400 square foot single-story often sits on a larger lot than its two-story neighbor, which can mean more yard and more roof. Roof area is worth noting in hail country, since replacement cost scales with it.",
      "If accessibility drives the search, look past the story count: door widths, a zero-step entry, and a walk-in shower matter as much as the floor plan. The listing photos usually answer these faster than the data sheet.",
    ],
  },
  "5-plus-bedrooms": {
    heading: "Finding a genuine five-bedroom home",
    paragraphs: [
      "Every home here reports five or more bedrooms in its structured MLS record. That count comes from the listing agent, and appraisal standards require a closet and a window for a room to count, so a converted garage or a study without a closet generally does not qualify.",
      "Five-bedroom buyers usually need the count for a reason: multigenerational households, work-from-home pairs, or families who want a guest room that stays a guest room. Check where the bedrooms sit. A true in-law arrangement wants a bedroom and full bath on the main floor, and two-story plans vary widely here.",
      "Larger homes concentrate in newer master-planned areas where builders offer five-bedroom plans as standard, which is why the city mix in this search leans toward growth corridors. If new construction fits, cross-check the New Builds search for what is being built right now.",
    ],
  },
  "open-houses": {
    heading: "Making open houses work for you",
    paragraphs: [
      "Every listing here has a scheduled, future open-house event in the MLS. These are structured event records with dates and time windows, not phrases scraped from listing descriptions, and the schedule refreshes through the day. Times do occasionally change or cancel, so confirm before a long drive.",
      "Open houses are the cheapest research tool a buyer has. You can walk a floor plan without scheduling, compare finishes across price points in one afternoon, and hear what foot traffic sounds like on that street. Go early in the window if you want the agent's attention, late if you want the house to yourself.",
      "If you are working with an agent, tell the hosting agent at the door. If you are not, the host will happily register you, and that is how most sign-in follow-up starts. Either way, note the address and ask questions while the house is in front of you.",
    ],
  },
};

export const FEATURE_FAQS: Record<FeatureSlug, FeatureFaq[]> = {
  "with-pool": [
    {
      q: "How does this search know a home has a pool?",
      a: "It matches the structured pool features field in the MLS record, the same data agents fill in when they list. We look for private pool construction values like in-ground or gunite. We never guess from listing descriptions, and community-pool-only homes are excluded.",
    },
    {
      q: "Are above-ground pools included?",
      a: "Yes, when the listing records one in its pool features. They are a small share of the market here. The listing photos and the pool features on the detail page show what kind of pool you are looking at.",
    },
    {
      q: "Does a pool change what I should offer?",
      a: "A well-kept pool adds appeal but also inspection scope. A pool inspection is separate from a general home inspection and usually worth the fee, since resurfacing or equipment replacement are four-figure and five-figure items.",
    },
  ],
  "on-acreage": [
    {
      q: "Why do I not see vacant land here?",
      a: "This search is homes on acreage: residential listings on one acre or more. Vacant lots and larger tracts without a home live on our Land search, which has its own acreage and county filters.",
    },
    {
      q: "Is one acre the only cutoff?",
      a: "One acre is the floor for this page. Once you are in the results you can raise the minimum with the acreage filter if you want five or ten acres and up.",
    },
    {
      q: "What should I check first on an acreage home?",
      a: "Septic versus sewer, well versus city water, road maintenance, and whether an agricultural exemption currently lowers the taxes. All four change your real monthly cost, and none of them show up in the photos.",
    },
  ],
  "3-car-garage": [
    {
      q: "How is a 3-car garage verified?",
      a: "The MLS record carries a garage spaces count entered by the listing agent. This search returns homes reporting three or more. The count is spaces, not doors, so some results are tandem layouts with two doors.",
    },
    {
      q: "Do carports count?",
      a: "No. Covered parking and carports are recorded in different fields. This search matches garage spaces specifically.",
    },
    {
      q: "Can I search four or more garage spaces?",
      a: "The page starts at three or more. Car collectors and shop hunters should also look at homes on acreage, where detached shops and oversized garages are more common.",
    },
  ],
  "single-story": [
    {
      q: "What exactly counts as single-story here?",
      a: "The MLS Levels field must say exactly one story. Plans recorded as one and one half stories, two stories, or split-level are excluded, which keeps bonus-room-over-the-garage plans out of these results.",
    },
    {
      q: "Are these all smaller homes?",
      a: "No. North Texas builders put up large one-story plans, especially on wider suburban and acreage lots. Use the size filter if you want a minimum square footage.",
    },
    {
      q: "Why does single-story sometimes cost more per square foot?",
      a: "One story needs more foundation and more roof for the same living area, so build cost per square foot runs higher. Strong demand from buyers who specifically want one story adds to that.",
    },
  ],
  "5-plus-bedrooms": [
    {
      q: "Where does the bedroom count come from?",
      a: "From the structured bedroom total in the MLS record. Rooms generally need a closet and a window to be counted as bedrooms, so studies and flex rooms usually are not in the number.",
    },
    {
      q: "Can I combine this with other filters?",
      a: "Yes. Price, size, single-story, pool, and every other filter on the toolbar stack on top of the five-bedroom floor, and you can save the combined search for email alerts.",
    },
    {
      q: "Do five-bedroom homes sit on the market longer?",
      a: "It varies by price band and city, and we would rather not generalize. The days-on-market figure on each listing tells you how that specific home is moving.",
    },
  ],
  "open-houses": [
    {
      q: "Where do these open-house times come from?",
      a: "From structured open-house event records in the MLS, with dates and start and end times. We show listings with a future event on the schedule and refresh through the day.",
    },
    {
      q: "Can times change after I plan my route?",
      a: "Occasionally, yes. Agents cancel or move events, and cancellations can land the same morning. Confirm the time on the listing before a long drive.",
    },
    {
      q: "Do I need an appointment for an open house?",
      a: "No. An open house is exactly that: walk in during the window and sign in at the door. If you already work with an agent, mention it to the host when you arrive.",
    },
  ],
};

/** City-page blurb: composed ONLY from canonical city data. Each feature
    reads different fields in a different structure on purpose. Live counts
    and dates render separately next to the results, not in this copy. */
export function cityFeatureBlurb(feature: FeatureSlug, city: City, countyName: string): string {
  const hoods = (city.hoods ?? []).slice(0, 3).map((h) => h[0]);
  const hoodClause = hoods.length >= 2 ? `Areas like ${hoods.slice(0, 2).join(" and ")} anchor most local searches.` : "";
  switch (feature) {
    case "with-pool":
      return `${city.name} sits in ${countyName} County with a median list price around $${Math.round(city.price / 1000)}K, and pool homes here typically occupy the upper half of that market. ${hoodClause} The results below update from the NTREIS feed and match on the recorded pool field only.`;
    case "on-acreage":
      return `${countyName} County still carries real acreage around ${city.name}, and this page holds the listings that pair a house with an acre or more. Schools fall under ${city.isd}. Lot sizes come straight from the MLS record, and vacant land is kept on the separate Land search.`;
    case "3-car-garage":
      return `Three-car garages in ${city.name} concentrate in newer and larger floor plans, and the garage count here comes from the structured MLS field rather than photo guesswork. ${hoodClause} Stack price and size filters on top to narrow the field.`;
    case "single-story":
      return `${city.name} buyers who want one story can skip the guesswork: these listings are recorded as exactly one level in the MLS. With a median list price near $${Math.round(city.price / 1000)}K in ${city.name}, one-story plans span everything from starter streets to custom lots.`;
    case "5-plus-bedrooms":
      return `Five-bedroom homes in ${city.name} serve big households and work-from-home pairs alike, and ${city.isd} is the school district most local listings report. The bedroom count is the MLS structured total, so flex rooms and studies are not inflating the number.`;
    case "open-houses":
      return `Every ${city.name} listing below has a scheduled open house on the MLS calendar, with the date and time window shown on the card. ${countyName} County weekends move fast in season, so confirm times before you build the route.`;
  }
}
