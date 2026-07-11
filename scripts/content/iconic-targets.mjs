/* CI-4b curated iconic targets — SCRIPT-OWNED DATA (imported only by
 * scripts/content/find-photo-candidates.mjs; the app never touches it).
 *
 * Maps a slot key ("entity_type/entity_slug/slot_key") to the Wikidata/
 * Commons identity of the landmark the slot's label means. Every entry is
 * reviewable: label = what the slot shows, verify = the URL a human checks,
 * note = why this is the intended landmark. Prefer wikipediaTitle over raw
 * QIDs — titles are readable in review and resolve to QIDs at runtime
 * through the same validated path as cities (redirects followed).
 *
 * NOTHING here is trusted blindly at runtime: resolved items must pass the
 * P625-coordinate proximity check when the slot has coordinates, files must
 * resolve on Commons, and every existing gate (license allowlist, bitmap
 * MIME, min width, orientation, non-photo blocklist) still applies. A bad
 * entry therefore degrades to "no structured results" — it can never stage
 * a wrong-place candidate on its own. Entries whose article/category names
 * are uncertain are validated live at the --sample gate before any apply.
 */
export const ICONIC_TARGETS = {
  /* ---- homepage picks (the four cards) -------------------------------- */
  "homepage/denton/pick": {
    label: "THE COURTHOUSE SQUARE",
    wikipediaTitle: "Denton County Courthouse-on-the-Square",
    commonsCategory: "Denton County Courthouse-on-the-Square Museum",
    verify: "https://en.wikipedia.org/wiki/Denton_County_Courthouse-on-the-Square",
    note: "1896 courthouse on the downtown Denton square — the pick's exact subject",
  },
  "homepage/fort-worth/pick": {
    label: "THE STOCKYARDS",
    wikipediaTitle: "Fort Worth Stockyards",
    commonsCategory: "Fort Worth Stockyards",
    verify: "https://en.wikipedia.org/wiki/Fort_Worth_Stockyards",
    note: "National Historic District; Exchange Ave photos live in this category",
  },
  "homepage/dallas/pick": {
    label: "THE SKYLINE",
    wikipediaTitle: "Downtown Dallas",
    commonsCategory: "Skylines of Dallas, Texas",
    verify: "https://commons.wikimedia.org/wiki/Category:Skylines_of_Dallas,_Texas",
    note: "skyline category preferred over the article (article P18 may be a street view)",
  },
  "homepage/frisco/pick": {
    label: "THE STAR DISTRICT",
    wikipediaTitle: "The Star (Frisco, Texas)",
    verify: "https://en.wikipedia.org/wiki/The_Star_(Frisco,_Texas)",
    note: "Cowboys HQ/The Star development — the district the pick names",
  },

  /* ---- explicit city gallery labels (landmark-specific) ---------------- */
  "city/arlington/gallery-0": {
    label: "AT&T Stadium plaza",
    wikipediaTitle: "AT&T Stadium",
    verify: "https://en.wikipedia.org/wiki/AT%26T_Stadium",
    note: "the stadium itself; plaza shots live in its Commons category via P373",
  },
  "city/arlington/gallery-1": {
    label: "Globe Life Field gates",
    wikipediaTitle: "Globe Life Field",
    verify: "https://en.wikipedia.org/wiki/Globe_Life_Field",
    note: "Rangers ballpark (2020) — NOT Globe Life Park, the older venue",
  },
  "city/fort-worth/gallery-0": {
    label: "the Stockyards",
    wikipediaTitle: "Fort Worth Stockyards",
    verify: "https://en.wikipedia.org/wiki/Fort_Worth_Stockyards",
    note: "same target as the homepage pick",
  },
  "city/fort-worth/gallery-1": {
    label: "Sundance Square",
    wikipediaTitle: "Sundance Square",
    verify: "https://en.wikipedia.org/wiki/Sundance_Square",
    note: "downtown Fort Worth entertainment district",
  },
  "city/dallas/gallery-0": {
    label: "the skyline",
    commonsCategory: "Skylines of Dallas, Texas",
    verify: "https://commons.wikimedia.org/wiki/Category:Skylines_of_Dallas,_Texas",
    note: "category-only mapping; no single article needed",
  },
  "city/frisco/gallery-0": {
    label: "The Star district",
    wikipediaTitle: "The Star (Frisco, Texas)",
    verify: "https://en.wikipedia.org/wiki/The_Star_(Frisco,_Texas)",
    note: "same target as the homepage pick",
  },
  "city/grapevine/gallery-0": {
    label: "Historic Main Street",
    wikipediaTitle: "Grapevine, Texas",
    commonsCategory: "Grapevine, Texas",
    verify: "https://en.wikipedia.org/wiki/Grapevine,_Texas",
    note: "no dedicated Main Street article; city item's P18 is the Main St streetscape",
  },
  "city/plano/gallery-0": {
    label: "Legacy West",
    wikipediaTitle: "Legacy West",
    verify: "https://en.wikipedia.org/wiki/Legacy_West",
    note: "Plano's flagship mixed-use district",
  },
  "city/southlake/gallery-0": {
    label: "Town Square",
    wikipediaTitle: "Southlake Town Square",
    verify: "https://en.wikipedia.org/wiki/Southlake_Town_Square",
    note: "the city's signature development",
  },
  "city/mckinney/gallery-0": {
    label: "historic downtown",
    wikipediaTitle: "McKinney, Texas",
    commonsCategory: "McKinney, Texas",
    verify: "https://en.wikipedia.org/wiki/McKinney,_Texas",
    note: "downtown square photos live under the city category",
  },
  "city/denton/gallery-0": {
    label: "the courthouse square",
    wikipediaTitle: "Denton County Courthouse-on-the-Square",
    verify: "https://en.wikipedia.org/wiki/Denton_County_Courthouse-on-the-Square",
    note: "same target as the homepage pick",
  },

  /* ---- famous hoods with real Wikidata items --------------------------- */
  "neighborhood/dallas/deep-ellum/hero": {
    label: "Deep Ellum",
    wikipediaTitle: "Deep Ellum, Dallas",
    verify: "https://en.wikipedia.org/wiki/Deep_Ellum,_Dallas",
    note: "historic entertainment district east of downtown",
  },
  "neighborhood/dallas/bishop-arts/hero": {
    label: "Bishop Arts District",
    wikipediaTitle: "Bishop Arts District",
    verify: "https://en.wikipedia.org/wiki/Bishop_Arts_District",
    note: "Oak Cliff arts district — batch photos confirmed real coverage exists",
  },
  "neighborhood/irving/las-colinas/hero": {
    label: "Las Colinas",
    wikipediaTitle: "Las Colinas",
    verify: "https://en.wikipedia.org/wiki/Las_Colinas",
    note: "master-planned district; Mustangs sculpture photos already staged from here",
  },
  "neighborhood/dallas/lakewood/hero": {
    label: "Lakewood",
    wikipediaTitle: "Lakewood, Dallas",
    verify: "https://en.wikipedia.org/wiki/Lakewood,_Dallas",
    note: "the DALLAS Lakewood — structured mapping prevents the Georgia collision entirely",
  },
};
