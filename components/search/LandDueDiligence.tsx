/* The land-buying due-diligence guide — sits BELOW the /land results (never
   above them; the product comes first). Substantial and specific to North
   Texas, not SEO filler. It deliberately makes NO legal, engineering, tax,
   environmental, or survey guarantees: every item points back to independent,
   professional verification. Server component — pure content, no client JS. */

const TOPICS: { h: string; body: string }[] = [
  {
    h: "Residential lot vs. raw acreage",
    body:
      "A platted lot inside a city usually comes with utilities at the street and a clear building path. Raw acreage in the county can mean no water line, no sewer, an unpaved approach, and a much longer road to a permit. Decide which you are actually buying before you compare prices per acre — they are not the same product.",
  },
  {
    h: "Survey & boundaries",
    body:
      "MLS acreage and plat maps are a starting point, not a legal boundary. A current on-the-ground survey (and, for larger tracts, a metes-and-bounds description) is how you learn where the corners really are, whether fences match the deed, and if anyone is encroaching. Order one from a licensed Texas surveyor before closing.",
  },
  {
    h: "Legal access & road frontage",
    body:
      "Land is only usable if you can legally reach it. Confirm frontage on a public road, or a recorded, deeded easement across neighboring property — a two-track someone has 'always used' is not access. In the counties, ask who maintains the road and whether it is county-accepted or private.",
  },
  {
    h: "Water: city, well, or haul",
    body:
      "Inside a city or a rural water-supply district, tap fees and line extensions vary widely. Outside one, you are likely drilling a well — depth, yield, and water quality differ across Denton, Wise, Parker, and the eastern counties. Verify the provider or budget a well; never assume water is 'there.'",
  },
  {
    h: "Wastewater: sewer or septic",
    body:
      "No municipal sewer usually means an on-site septic system (OSSF). Whether a lot will perc depends on soil and lot size, and the county health department permits it. On the Blackland Prairie clay east and south of Dallas, soils can complicate conventional systems — get a soil/site evaluation.",
  },
  {
    h: "Electric & utilities",
    body:
      "Confirm which co-op or utility serves the parcel (CoServ, Oncor, Tri-County, United, and others split the metro) and how far the nearest line runs. A long service extension to a back building site can cost real money. Ask about gas, fiber/broadband, and any existing meters or drops.",
  },
  {
    h: "Floodplain & drainage",
    body:
      "Check the FEMA flood map and look at where water goes in a hard North Texas rain. A parcel touching a creek, a FEMA zone, or a low draw can carry building restrictions, fill limits, and insurance costs. Elevation and a drainage plan matter as much as the acreage number.",
  },
  {
    h: "Zoning, county & ETJ",
    body:
      "Inside city limits, zoning and platting control what you can build. In a city's extraterritorial jurisdiction (ETJ) or open county, rules are lighter but subdivision, platting, and driveway/culvert permits still apply. Confirm the jurisdiction and intended use with the city or county before you plan.",
  },
  {
    h: "Deed restrictions & HOA",
    body:
      "Rural does not always mean unrestricted. Recorded deed restrictions can limit mobile homes, livestock, minimum square footage, or subdividing, and some tracts sit inside an HOA or POA with dues. Read the recorded documents for the specific parcel — they run with the land, not the seller.",
  },
  {
    h: "Ag & wildlife exemptions",
    body:
      "Many North Texas tracts carry an agricultural or wildlife-management valuation that keeps property taxes low. It is a use-based valuation, not automatic — changing use, or failing to maintain qualifying activity, can trigger a rollback of back taxes. Confirm the current status with the county appraisal district.",
  },
  {
    h: "Buildability & soil",
    body:
      "Expansive clay, rock, slope, and existing structures all affect what a home site costs to build. A geotechnical look, a septic soil test, and a walk of the actual building envelope tell you more than the listing photos. Budget for site work, not just the land price.",
  },
  {
    h: "Verify everything independently",
    body:
      "Treat listing remarks, acreage, and 'buildable' language as leads to check, not facts. Use your own surveyor, title company, inspectors, lender, and the relevant city/county offices. Discover DFW helps you organize the questions and compare parcels — it does not perform survey, title, engineering, or environmental work.",
  },
];

export default function LandDueDiligence() {
  return (
    <section aria-labelledby="land-guide-head" style={{ borderTop: "2px solid #1D1913", background: "#FBF7EE" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(40px,5vw,64px) 4vw" }}>
        <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".26em", fontWeight: 700, color: "#C13E17" }}>
          BEFORE YOU MAKE AN OFFER
        </div>
        <h2 id="land-guide-head" className="font-serif" style={{ margin: "10px 0 0", fontWeight: 800, fontSize: "clamp(24px,3.2vw,34px)", lineHeight: 1.1, maxWidth: 760 }}>
          What to check before you buy land in North Texas
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.65, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          Buying land is a different job than buying a house. The value is in what you can legally do with the dirt — reach it, get water and power to it, and build on it. Here is what North Texas buyers verify, parcel by parcel, before they write an offer.
        </p>

        <div className="land-guide-grid" style={{ marginTop: 32 }}>
          {TOPICS.map((t) => (
            <div key={t.h} style={{ borderTop: "1.5px solid rgba(29,25,19,.22)", paddingTop: 16 }}>
              <h3 className="font-serif" style={{ margin: 0, fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{t.h}</h3>
              <p style={{ margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.72)" }}>{t.body}</p>
            </div>
          ))}
        </div>

        <p className="font-mono" style={{ margin: "30px 0 0", fontSize: 10.5, lineHeight: 1.7, letterSpacing: ".04em", color: "rgba(29,25,19,.55)", maxWidth: 760 }}>
          This guide is general information for North Texas land buyers, not legal, engineering, tax, environmental, or survey advice, and it is not a guarantee about any specific parcel. Confirm every detail with the appropriate licensed professional and the governing city or county before you rely on it.
        </p>
      </div>
    </section>
  );
}
