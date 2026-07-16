# Publication audit — unfinished / internal content

> GENERATED FILE — do not hand-edit. Regenerate with `npm run audit:public-content`.
> Internal working document; not a public route.

- Generated: 2026-07-16T22:26:01.126Z
- Base URL: http://localhost:4319 · MLS mode: `local` (live)
- Pages crawled: 805 (city-report: 90, neighborhood-report: 341, homepage: 1, new-build-report: 34, city-homes-search: 210, homes-search: 129)
- Fail condition: critical = internal-production phrase visibly rendered on an indexable page

| Severity | Count |
|---|---|
| critical | 0 |
| high | 0 |
| medium | 408 |
| low | 467 |

Notes on route coverage: About and The Letter (newsletter) are homepage sections, audited under `/`. County pages do not exist as routes — counties render as homepage map regions and city-index groupings. Listing pages are sampled (high-churn, never in the sitemap).

## CRITICAL (0)

_None._

## HIGH (0)

_None._

## MEDIUM (408)

### missing-images (374)

_374 pages affected — full list in `data/publication-audit.json`._

- Recommendation: Approve photos for this page's slots via the Photo Desk (photo_candidates → approve). Page may stay public — layout is designed to hold without photos.
- Source: photo pipeline: lib/content/editorial-photos.ts + admin Photo Desk
- Can remain public during remediation: yes
- Sample pages: `/city/addison/addison-circle`, `/city/addison/les-lacs`, `/city/addison/midway-meadows`, `/city/addison/vitruvian-park`, `/city/allen/montgomery-farm`, `/city/allen/starcreek`, `/city/allen/twin-creeks`, `/city/allen/watters-crossing`, `/city/anna/anacapri`, `/city/anna/churchill` …

### unverified-newbuild-figures (34)

_34 pages affected — full list in `data/publication-audit.json`._

- Recommendation: Pricing/builder-count/status figures have no verification date. Add a verified-as-of field to the newBuilds entry (and render it), or publish through the human-verified Supabase pipeline.
- Source: lib/dfw.data.json (newBuilds entry)
- Can remain public during remediation: yes
- Sample pages: `/city/anna/anacapri`, `/city/anna/churchill`, `/city/anna/parks-at-foster-crossing`, `/city/argyle/harvest`, `/city/arlington/viridian`, `/city/aubrey/sandbrock-ranch`, `/city/celina/light-farms`, `/city/celina/mosaic`, `/city/celina/ramble`, `/city/celina/the-parks-at-wilson-creek` …

## LOW (467)

### generated-fallback-copy (154)

_154 pages affected — full list in `data/publication-audit.json`._

- Recommendation: Replace generated copy with reviewed editorial content via the Content Desk export. Page may remain public — fallback copy is deterministic and claim-safe by design.
- Source: lib/hoods.ts contentFor() fallback
- Can remain public during remediation: yes
- Sample pages: `/city/addison/addison-circle`, `/city/addison/les-lacs`, `/city/addison/midway-meadows`, `/city/addison/vitruvian-park`, `/city/anna/churchill`, `/city/anna/parks-at-foster-crossing`, `/city/balch-springs/cheyenne`, `/city/balch-springs/elam-corridor`, `/city/balch-springs/hickory-tree`, `/city/balch-springs/mesquite-creek` …

### drive-time-claims (209)

_209 pages affected — full list in `data/publication-audit.json`._

- Recommendation: Figures derive from the OSRM pass — re-verify whenever the commute dataset is refreshed.
- Source: lib/hood-content.json / lib/hoods.ts contentFor()
- Can remain public during remediation: yes
- Sample pages: `/city/allen/montgomery-farm`, `/city/allen/starcreek`, `/city/allen/twin-creeks`, `/city/allen/watters-crossing`, `/city/anna/anacapri`, `/city/anna/sherley-farms`, `/city/anna/villages-of-hurricane-creek`, `/city/anna/west-crossing`, `/city/argyle/5t-ranch`, `/city/argyle/country-lakes` …

### provenance-label (34)

_34 pages affected — full list in `data/publication-audit.json`._

- Recommendation: Deliberate estimate label — keep, but confirm final wording in the broker/legal compliance review.
- Source: app/city/[slug]/[hood]/page.tsx + lib/dfw.data.json (newBuilds) + lib/hood-content.json
- Can remain public during remediation: yes
- Sample pages: `/city/anna/anacapri`, `/city/anna/churchill`, `/city/anna/parks-at-foster-crossing`, `/city/argyle/harvest`, `/city/arlington/viridian`, `/city/aubrey/sandbrock-ranch`, `/city/celina/light-farms`, `/city/celina/mosaic`, `/city/celina/ramble`, `/city/celina/the-parks-at-wilson-creek` …

### mls-data-artifact (70)

| URL | Page type | City / community | Phrase / finding | Rendered | Indexable | Stay public? |
|---|---|---|---|---|---|---|
| `/city/anna/homes?page=2` | city-homes-search | Anna | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/argyle/homes?page=3` | city-homes-search | Argyle | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/aubrey/homes?page=2` | city-homes-search | Aubrey | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/aurora/homes` | city-homes-search | Aurora | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/boyd/homes` | city-homes-search | Boyd | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/boyd/homes?page=2` | city-homes-search | Boyd | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/bridgeport/homes?page=2` | city-homes-search | Bridgeport | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/bridgeport/homes?page=3` | city-homes-search | Bridgeport | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/burleson/homes?page=2` | city-homes-search | Burleson | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/colleyville/homes?page=2` | city-homes-search | Colleyville | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/decatur/homes` | city-homes-search | Decatur | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/decatur/homes?page=2` | city-homes-search | Decatur | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/denton/homes?page=3` | city-homes-search | Denton | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/ennis/homes` | city-homes-search | Ennis | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/ennis/homes?page=2` | city-homes-search | Ennis | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/farmersville/homes?page=3` | city-homes-search | Farmersville | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/flower-mound/homes` | city-homes-search | Flower Mound | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/flower-mound/homes?page=2` | city-homes-search | Flower Mound | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/frisco/homes?page=3` | city-homes-search | Frisco | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/kaufman/homes` | city-homes-search | Kaufman | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/kaufman/homes?page=2` | city-homes-search | Kaufman | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/keller/homes` | city-homes-search | Keller | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/lucas/homes` | city-homes-search | Lucas | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/lucas/homes?page=2` | city-homes-search | Lucas | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/mansfield/homes?page=2` | city-homes-search | Mansfield | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/mckinney/homes` | city-homes-search | McKinney | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/melissa/homes` | city-homes-search | Melissa | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/midlothian/homes?page=2` | city-homes-search | Midlothian | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/nevada/homes` | city-homes-search | Nevada | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/nevada/homes?page=2` | city-homes-search | Nevada | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/north-richland-hills/homes?page=2` | city-homes-search | North Richland Hills | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/ovilla/homes` | city-homes-search | Ovilla | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/princeton/homes?page=2` | city-homes-search | Princeton | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/princeton/homes?page=3` | city-homes-search | Princeton | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/rhome/homes` | city-homes-search | Rhome | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/rhome/homes?page=3` | city-homes-search | Rhome | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/roanoke/homes?page=3` | city-homes-search | Roanoke | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/royse-city/homes?page=2` | city-homes-search | Royse City | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/sanger/homes` | city-homes-search | Sanger | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/sanger/homes?page=2` | city-homes-search | Sanger | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/sanger/homes?page=3` | city-homes-search | Sanger | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/southlake/homes?page=2` | city-homes-search | Southlake | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/terrell/homes?page=2` | city-homes-search | Terrell | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/waxahachie/homes` | city-homes-search | Waxahachie | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/city/waxahachie/homes?page=2` | city-homes-search | Waxahachie | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=anna&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=aubrey&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=aurora` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=boyd` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=boyd&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=bridgeport&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=decatur` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=decatur&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=ennis` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=flower-mound` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=flower-mound&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=kaufman` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=keller` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=lucas` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=lucas&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=mckinney` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=melissa` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=nevada` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=nevada&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=ovilla` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=princeton&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=rhome` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=sanger` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=sanger&page=2` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |
| `/homes?city=waxahachie` | homes-search | — | MLS-provided "TBD <street>" address on listing card(s) | yes | yes | yes |

- **PA-821** `/city/anna/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “TE SERVICES MLS# 21108939 · NTREIS ♡ MLS PHOTO — ANNA — 22 PHOTOS NEW — 0 DAYS $1,500,000 TBD Cr-915 WOODLAND MEADOWS · ANNA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Anna market — day 1”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-861** `/city/argyle/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “H CENTRAL METRO 2 MLS# 21308655 · NTREIS ♡ MLS PHOTO — ARGYLE — 4 PHOTOS 18 DAYS $650,000 TBD Meadow View Drive CANYON OAKS 2 PH 2 · ARGYLE ↗ 0 BD 0 BA 0 SQFT 0 BUILT Canyon Oaks 2 Ph”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-793** `/city/aubrey/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “MES AND LAND MLS# 21285065 · NTREIS ♡ MLS PHOTO — AUBREY — 0 PHOTOS NEW — 0 DAYS $799,000 tbd Caddell Street D COWAN · AUBREY ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Aubrey market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-205** `/city/aurora/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ission Consumer Protection Notice ♡ MLS PHOTO — AURORA — 2 PHOTOS NEW — 5 DAYS $2,100,000 TBD Airfield Road NONE · AURORA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Aurora market — day 5 o”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-180** `/city/boyd/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “T REALTY, LLC MLS# 21319480 · NTREIS ♡ MLS PHOTO — BOYD — 20 PHOTOS NEW — 0 DAYS $350,000 TBD 1 Timber Oaks Lane TIMBER OAKS · BOYD ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Boyd market —”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-816** `/city/boyd/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “F ULTIMA REAL ESTATE MLS# 21304918 · NTREIS ♡ MLS PHOTO — BOYD — 6 PHOTOS 25 DAYS $70,000 TBD Boyd Avenue ORIGINAL TOWN OF BOYD · BOYD ↗ 0 BD 0 BA 0 SQFT 0 BUILT Original Town of Boyd”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-804** `/city/bridgeport/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “IDGEPORT MLS# 21230066 · NTREIS ♡ MLS PHOTO — BRIDGEPORT — 3 PHOTOS NEW — 0 DAYS $525,000 TBD 13th Street LAWDWIN ADD · BRIDGEPORT ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Bridgeport mar”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-867** `/city/bridgeport/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “REAL ESTATE MLS# 21297498 · NTREIS ♡ MLS PHOTO — BRIDGEPORT — 20 PHOTOS 15 DAYS $850,000 TBD FM 1658 0 · BRIDGEPORT ↗ 0 BD 0 BA 0 SQFT 0 BUILT 0, Bridgeport — 15 days on the market.”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-840** `/city/burleson/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “SIONALS MLS# 21299857 · NTREIS ♡ MLS PHOTO — BURLESON — 21 PHOTOS NEW — 0 DAYS $4,615,930 TBD County Road 1021 NA · BURLESON ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Burleson market — da”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-838** `/city/colleyville/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “LIAMS REALTY MLS# 21310332 · NTREIS ♡ MLS PHOTO — COLLEYVILLE — 40 PHOTOS 8 DAYS $850,000 TBD Bettinger Drive GILMORE JOHN ADD · COLLEYVILLE ↗ 0 BD 0 BA 0 SQFT 1965 BUILT Gilmore John”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-166** `/city/decatur/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “BOWMAN, INC. MLS# 21310707 · NTREIS ♡ MLS PHOTO — DECATUR — 1 PHOTOS NEW — 0 DAYS $5,000 TBD Shady Lane NONE · DECATUR ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Decatur market — day 1 on”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-805** `/city/decatur/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ASSOCIATES MLS# 21259140 · NTREIS ♡ MLS PHOTO — DECATUR — 10 PHOTOS NEW — 1 DAYS $185,000 TBD Lot 1 FM 455 PORTER · DECATUR ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Decatur market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-860** `/city/denton/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “WMAN, INC. MLS# 21278898 · NTREIS ♡ MLS PHOTO — DENTON — 4 PHOTOS NEW — 0 DAYS $1,400,000 TBD Shoreline Drive UNICORN LAKE · DENTON ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Denton market”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-785** `/city/ennis/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ANKER REALTY MLS# 21323251 · NTREIS ♡ MLS PHOTO — ENNIS — 16 PHOTOS NEW — 0 DAYS $500,000 TBD Lot 23 B Alsdorf Road A GARZA · ENNIS ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Ennis market”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-857** `/city/ennis/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “END HOME CORP MLS# 21293259 · NTREIS ♡ MLS PHOTO — ENNIS — 6 PHOTOS NEW — 1 DAYS $150,000 TBD Lot 7R Valek Road CAMODO ADDITION · ENNIS ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Ennis mar”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-875** `/city/farmersville/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “TORS MLS# 21285027 · NTREIS ♡ MLS PHOTO — FARMERSVILLE — 2 PHOTOS NEW — 0 DAYS $1,053,650 tbd CR 571 ABS A0658 J C NEILL SURVEY · FARMERSVILLE ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Fa”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-131** `/city/flower-mound/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ION MLS# 21308776 · NTREIS ♡ MLS PHOTO — FLOWER MOUND — 13 PHOTOS NEW — 0 DAYS $3,250,000 TBD Scenic Drive TODD ADD · FLOWER MOUND ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Flower Mound m”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-803** `/city/flower-mound/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “Consumer Protection Notice ♡ MLS PHOTO — FLOWER MOUND — 13 PHOTOS NEW — 0 DAYS $6,935,000 TBD Fm 1171 MCGOWAN & PITCOCK · FLOWER MOUND ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Flower Mou”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-871** `/city/frisco/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “REAL ESTATE MLS# 21262403 · NTREIS ♡ MLS PHOTO — FRISCO — 1 PHOTOS NEW — 0 DAYS $118,000 TBD Cedar Lane BOYD ACRES · FRISCO ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Frisco market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-761** `/city/kaufman/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “REALTY LLC MLS# 21305926 · NTREIS ♡ MLS PHOTO — KAUFMAN — 2 PHOTOS NEW — 0 DAYS $270,765 TBD Lot 12 Fm 2860 A0217 · KAUFMAN ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Kaufman market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-855** `/city/kaufman/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “S# 21293165 · NTREIS ♡ MLS PHOTO — KAUFMAN — 18 PHOTOS NEW — 2 DAYS $269,997 $ 127 / SQFT TBD Lagitas Court VALENCIA · KAUFMAN ↗ 5 BD 3 BA 2,128 SQFT 2025 BUILT New to the Kaufman mar”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-434** `/city/keller/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “EALTY LLC MLS# 21320089 · NTREIS ♡ MLS PHOTO — KELLER — 40 PHOTOS NEW — 0 DAYS $5,800,000 TBD Keller Smithfield THE BIRCH ADDITION · KELLER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Kelle”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-287** `/city/lucas/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “DALLAS SUBURBS MLS# 21332853 · NTREIS ♡ MLS PHOTO — LUCAS — 5 PHOTOS NEW — 0 DAYS $1,000 TBD CR-890 TRINITY PARK ADD · LUCAS ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Lucas market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-827** `/city/lucas/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “MARKET — 24 HOMES NEWEST FIRST · MOCK FEED ♡ MLS PHOTO — LUCAS — 5 PHOTOS 8 DAYS $64,999 TBD County Road 890 TRINITY PARK ADD · LUCAS ↗ 0 BD 0 BA 0 SQFT 0 BUILT Trinity Park Add, Luc”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-839** `/city/mansfield/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “Y FRISCO MLS# 21185125 · NTREIS ♡ MLS PHOTO — MANSFIELD — 14 PHOTOS NEW — 0 DAYS $112,585 TBD Sam Booker Road NA · MANSFIELD ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Mansfield market — d”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-263** `/city/mckinney/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “WEEKLEY MLS# 21333502 · NTREIS ♡ MLS PHOTO — MCKINNEY — 22 PHOTOS NEW — 0 DAYS $6,000,000 TBD Parker Street A0085 · MCKINNEY ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the McKinney market — da”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-238** `/city/melissa/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ESUSA.COM MLS# 21287906 · NTREIS ♡ MLS PHOTO — MELISSA — 4 PHOTOS NEW — 0 DAYS $2,265,000 TBD County Road 413 NA · MELISSA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Melissa market — day 1”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-854** `/city/midlothian/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “REALTY MLS# 21295975 · NTREIS ♡ MLS PHOTO — MIDLOTHIAN — 23 PHOTOS NEW — 0 DAYS $450,000 TBD Waterworks Road WM BELL · MIDLOTHIAN ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Midlothian mar”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-389** `/city/nevada/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AVIS REALTY MLS# 21285997 · NTREIS ♡ MLS PHOTO — NEVADA — 20 PHOTOS NEW — 0 DAYS $729,900 TBD County Road 541 M C DUPEY SURV ABS #269 · NEVADA ↗ 0 BD 0 BA 0 SQFT 1984 BUILT New to the”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-830** `/city/nevada/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AMS REALTY ALLEN MLS# 21286376 · NTREIS ♡ MLS PHOTO — NEVADA — 10 PHOTOS 15 DAYS $135,000 TBD CR 637-Lot 1 HARVEST BEND · NEVADA ↗ 0 BD 0 BA 0 SQFT 0 BUILT Harvest Bend, Nevada — 15 d”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-832** `/city/north-richland-hills/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “LS# 21290551 · NTREIS ♡ MLS PHOTO — NORTH RICHLAND HILLS — 4 PHOTOS NEW — 1 DAYS $369,000 TBD Kirk Lane NEWTON, W C SURVEY ABSTRACT 1182 TRACT 2A2 · NORTH RICHLAND HILLS ↗ 0 BD 0 BA 0”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-783** `/city/ovilla/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ATHOM REALTY LLC MLS# 21314777 · NTREIS ♡ MLS PHOTO — OVILLA — 22 PHOTOS 21 DAYS $350,000 TBD Highland Road TANGLE WOOD HOLLOW · OVILLA ↗ 0 BD 0 BA 0 SQFT 0 BUILT Tangle wood Hollow,”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-829** `/city/princeton/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ES REALTY MLS# 21327289 · NTREIS ♡ MLS PHOTO — PRINCETON — 1 PHOTOS NEW — 0 DAYS $375,000 TBD County Road 947 SHAMROCK PARK · PRINCETON ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Princeton”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-874** `/city/princeton/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “CORNERS MLS# 21290095 · NTREIS ♡ MLS PHOTO — PRINCETON — 3 PHOTOS NEW — 0 DAYS $1,254,528 TBD Monte Carlo Boulevard SHOPPES AT MONTICELLO · PRINCETON ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-167** `/city/rhome/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “CORPORATION MLS# 21311883 · NTREIS ♡ MLS PHOTO — RHOME — 12 PHOTOS NEW — 0 DAYS $225,000 TBD Savanna Drive ESTATES AT CHISHOLM RIDGE · RHOME ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Rho”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-869** `/city/rhome/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “PRO REALTY LLC MLS# 21223682 · NTREIS ♡ MLS PHOTO — RHOME — 13 PHOTOS 75 DAYS $6,250,000 TBD Hwy 287 Highway S NONE · RHOME ↗ 0 BD 0 BA 0 SQFT 0 BUILT None, Rhome — 75 days on the ma”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-865** `/city/roanoke/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ONX REAL ESTATE MLS# 21227532 · NTREIS ♡ MLS PHOTO — ROANOKE — 31 PHOTOS 248 DAYS $94,900 TBD Sycamore Lane MARSHALL CREEK · ROANOKE ↗ 0 BD 0 BA 0 SQFT 1983 BUILT Marshall Creek, Roan”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-850** `/city/royse-city/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “Y LLC MLS# 21268896 · NTREIS ♡ MLS PHOTO — ROYSE CITY — 17 PHOTOS NEW — 0 DAYS $8,900,000 TBD Fm 1777 A0512 · ROYSE CITY ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Royse City market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-040** `/city/sanger/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “TLE REALTY MLS# 21276317 · NTREIS ♡ MLS PHOTO — SANGER — 3 PHOTOS NEW — 0 DAYS $2,750,000 TBD Metz Road WM MASON · SANGER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Sanger market — day 1 o”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-786** `/city/sanger/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ission Consumer Protection Notice ♡ MLS PHOTO — SANGER — 1 PHOTOS NEW — 0 DAYS $3,999,999 TBD I35 TIERWESTER · SANGER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Sanger market — day 1 on th”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-859** `/city/sanger/homes?page=3` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AMS, REALTORS MLS# 21316849 · NTREIS ♡ MLS PHOTO — SANGER — 4 PHOTOS NEW — 7 DAYS $50,000 TBD Bobcat Rd BOBCAT RD · SANGER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Sanger market — day 7”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-837** `/city/southlake/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “289018 · NTREIS ♡ MLS PHOTO — SOUTHLAKE — 15 PHOTOS NEW — 7 DAYS $9,995,000 $ 1083 / SQFT TBD Sunshine Lane SUNSHINE PLACE · SOUTHLAKE ↗ 6 BD 8 BA 9,230 SQFT 2026 BUILT New to the Sou”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-848** `/city/terrell/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “STATE, INC. MLS# 21170124 · NTREIS ♡ MLS PHOTO — TERRELL — 1 PHOTOS NEW — 0 DAYS $350,000 TBD Cr-301 C & C RANCH, BLOCK A, LOT 3 · TERRELL ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Terrel”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-782** `/city/waxahachie/homes` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “P REALTY MLS# 21330254 · NTREIS ♡ MLS PHOTO — WAXAHACHIE — 1 PHOTOS NEW — 0 DAYS $189,900 TBD 2.88 acres Nash-Howard Road HOWARD HILLS · WAXAHACHIE ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to t”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-852** `/city/waxahachie/homes?page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “S REALTY MLS# 21323804 · NTREIS ♡ MLS PHOTO — WAXAHACHIE — 3 PHOTOS NEW — 0 DAYS $250,000 TBD E FM 55 B3R ESTATES · WAXAHACHIE ↗ 0 BD 0 BA 0 SQFT 2026 BUILT New to the Waxahachie mark”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-868** `/homes?city=anna&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “TE SERVICES MLS# 21108939 · NTREIS ♡ MLS PHOTO — ANNA — 22 PHOTOS NEW — 0 DAYS $1,500,000 TBD Cr-915 WOODLAND MEADOWS · ANNA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Anna market — day 1”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-858** `/homes?city=aubrey&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “MES AND LAND MLS# 21285065 · NTREIS ♡ MLS PHOTO — AUBREY — 0 PHOTOS NEW — 0 DAYS $799,000 tbd Caddell Street D COWAN · AUBREY ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Aubrey market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-801** `/homes?city=aurora` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AVE HOMES MLS# 21272832 · NTREIS ♡ MLS PHOTO — AURORA — 2 PHOTOS NEW — 5 DAYS $2,100,000 TBD Airfield Road NONE · AURORA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Aurora market — day 5 o”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-802** `/homes?city=boyd` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “T REALTY, LLC MLS# 21319480 · NTREIS ♡ MLS PHOTO — BOYD — 20 PHOTOS NEW — 0 DAYS $350,000 TBD 1 Timber Oaks Lane TIMBER OAKS · BOYD ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Boyd market —”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-866** `/homes?city=boyd&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “F ULTIMA REAL ESTATE MLS# 21304918 · NTREIS ♡ MLS PHOTO — BOYD — 6 PHOTOS 25 DAYS $70,000 TBD Boyd Avenue ORIGINAL TOWN OF BOYD · BOYD ↗ 0 BD 0 BA 0 SQFT 0 BUILT Original Town of Boyd”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-863** `/homes?city=bridgeport&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “IDGEPORT MLS# 21230066 · NTREIS ♡ MLS PHOTO — BRIDGEPORT — 3 PHOTOS NEW — 0 DAYS $525,000 TBD 13th Street LAWDWIN ADD · BRIDGEPORT ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Bridgeport mar”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-799** `/homes?city=decatur` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “BOWMAN, INC. MLS# 21310707 · NTREIS ♡ MLS PHOTO — DECATUR — 1 PHOTOS NEW — 0 DAYS $5,000 TBD Shady Lane NONE · DECATUR ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Decatur market — day 1 on”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-864** `/homes?city=decatur&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ASSOCIATES MLS# 21259140 · NTREIS ♡ MLS PHOTO — DECATUR — 10 PHOTOS NEW — 1 DAYS $185,000 TBD Lot 1 FM 455 PORTER · DECATUR ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Decatur market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-853** `/homes?city=ennis` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ANKER REALTY MLS# 21323251 · NTREIS ♡ MLS PHOTO — ENNIS — 16 PHOTOS NEW — 0 DAYS $500,000 TBD Lot 23 B Alsdorf Road A GARZA · ENNIS ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Ennis market”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-798** `/homes?city=flower-mound` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ION MLS# 21308776 · NTREIS ♡ MLS PHOTO — FLOWER MOUND — 13 PHOTOS NEW — 0 DAYS $3,250,000 TBD Scenic Drive TODD ADD · FLOWER MOUND ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Flower Mound m”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-862** `/homes?city=flower-mound&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “LLC MLS# 21249965 · NTREIS ♡ MLS PHOTO — FLOWER MOUND — 13 PHOTOS NEW — 0 DAYS $6,935,000 TBD Fm 1171 MCGOWAN & PITCOCK · FLOWER MOUND ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Flower Mou”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-847** `/homes?city=kaufman` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “REALTY LLC MLS# 21305926 · NTREIS ♡ MLS PHOTO — KAUFMAN — 2 PHOTOS NEW — 0 DAYS $270,765 TBD Lot 12 Fm 2860 A0217 · KAUFMAN ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Kaufman market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-831** `/homes?city=keller` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “EALTY LLC MLS# 21320089 · NTREIS ♡ MLS PHOTO — KELLER — 40 PHOTOS NEW — 0 DAYS $5,800,000 TBD Keller Smithfield THE BIRCH ADDITION · KELLER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Kelle”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-824** `/homes?city=lucas` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “DALLAS SUBURBS MLS# 21332853 · NTREIS ♡ MLS PHOTO — LUCAS — 5 PHOTOS NEW — 0 DAYS $1,000 TBD CR-890 TRINITY PARK ADD · LUCAS ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Lucas market — day”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-870** `/homes?city=lucas&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “$/SQFT $ 310 DOM 61 READ THE CITY REPORT → ♡ MLS PHOTO — LUCAS — 5 PHOTOS 8 DAYS $64,999 TBD County Road 890 TRINITY PARK ADD · LUCAS ↗ 0 BD 0 BA 0 SQFT 0 BUILT Trinity Park Add, Luc”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-818** `/homes?city=mckinney` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “WEEKLEY MLS# 21333502 · NTREIS ♡ MLS PHOTO — MCKINNEY — 22 PHOTOS NEW — 0 DAYS $6,000,000 TBD Parker Street A0085 · MCKINNEY ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the McKinney market — da”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-817** `/homes?city=melissa` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ESUSA.COM MLS# 21287906 · NTREIS ♡ MLS PHOTO — MELISSA — 4 PHOTOS NEW — 0 DAYS $2,265,000 TBD County Road 413 NA · MELISSA ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Melissa market — day 1”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-828** `/homes?city=nevada` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AVIS REALTY MLS# 21285997 · NTREIS ♡ MLS PHOTO — NEVADA — 20 PHOTOS NEW — 0 DAYS $729,900 TBD County Road 541 M C DUPEY SURV ABS #269 · NEVADA ↗ 0 BD 0 BA 0 SQFT 1984 BUILT New to the”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-873** `/homes?city=nevada&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “AMS REALTY ALLEN MLS# 21286376 · NTREIS ♡ MLS PHOTO — NEVADA — 10 PHOTOS 15 DAYS $135,000 TBD CR 637-Lot 1 HARVEST BEND · NEVADA ↗ 0 BD 0 BA 0 SQFT 0 BUILT Harvest Bend, Nevada — 15 d”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-851** `/homes?city=ovilla` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ATHOM REALTY LLC MLS# 21314777 · NTREIS ♡ MLS PHOTO — OVILLA — 22 PHOTOS 21 DAYS $350,000 TBD Highland Road TANGLE WOOD HOLLOW · OVILLA ↗ 0 BD 0 BA 0 SQFT 0 BUILT Tangle wood Hollow,”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-872** `/homes?city=princeton&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “ES REALTY MLS# 21327289 · NTREIS ♡ MLS PHOTO — PRINCETON — 1 PHOTOS NEW — 0 DAYS $375,000 TBD County Road 947 SHAMROCK PARK · PRINCETON ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Princeton”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-800** `/homes?city=rhome` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “CORPORATION MLS# 21311883 · NTREIS ♡ MLS PHOTO — RHOME — 12 PHOTOS NEW — 0 DAYS $225,000 TBD Savanna Drive ESTATES AT CHISHOLM RIDGE · RHOME ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Rho”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-784** `/homes?city=sanger` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “TLE REALTY MLS# 21276317 · NTREIS ♡ MLS PHOTO — SANGER — 3 PHOTOS NEW — 0 DAYS $2,750,000 TBD Metz Road WM MASON · SANGER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Sanger market — day 1 o”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-856** `/homes?city=sanger&page=2` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “PROPERTIES MLS# 21233973 · NTREIS ♡ MLS PHOTO — SANGER — 1 PHOTOS NEW — 0 DAYS $3,999,999 TBD I35 TIERWESTER · SANGER ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to the Sanger market — day 1 on th”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.
- **PA-849** `/homes?city=waxahachie` — MLS-provided "TBD <street>" address on listing card(s)
  - excerpt: “P REALTY MLS# 21330254 · NTREIS ♡ MLS PHOTO — WAXAHACHIE — 1 PHOTOS NEW — 0 DAYS $189,900 TBD 2.88 acres Nash-Howard Road HOWARD HILLS · WAXAHACHIE ↗ 0 BD 0 BA 0 SQFT 0 BUILT New to t”
  - source: NTREIS feed data (UnparsedAddress) — not site copy
  - remediation: Feed-supplied address for land/new construction. Cosmetic only; optionally normalize to “Address to be assigned” in the listing-card formatter.

## Source-scan findings (not rendered — comments, gated strings, data records)

These phrases exist in runtime source but did not appear in any crawled page's visible text (typically code comments or strings gated behind `isLiveMls` / admin routes). Keep them out of render paths.

| File | Line | Phrase | Snippet |
|---|---|---|---|
| `app/api/admin/photos/route.ts` | 168 | PLACEHOLDER | `// revalidate so the placeholder returns; unpublish event already audited by the RPC` |
| `app/city/[slug]/homes/page.tsx` | 90 | SAMPLE INVENTORY | `SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED` |
| `app/city/[slug]/homes/page.tsx` | 90 | FICTIONAL (mock-inventory banner) | `SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED` |
| `app/city/[slug]/page.tsx` | 817 | PLACEHOLDER | `none exist (no public "DROP PHOTO" placeholders; the Photo Desk keeps` |
| `app/city/[slug]/page.tsx` | 817 | DROP PHOTO | `none exist (no public "DROP PHOTO" placeholders; the Photo Desk keeps` |
| `app/city/[slug]/page.tsx` | 880 | PLACEHOLDER | `{isLiveMls ? "LIVE FROM THE NTREIS FEED" : "PLACEHOLDER LISTINGS — CONNECT MLS"}` |
| `app/city/[slug]/page.tsx` | 880 | CONNECT MLS | `{isLiveMls ? "LIVE FROM THE NTREIS FEED" : "PLACEHOLDER LISTINGS — CONNECT MLS"}` |
| `app/city/[slug]/page.tsx` | 1258 | PLACEHOLDER | `© MMXXVI · {isLiveMls ? "LISTINGS LIVE FROM NTREIS" : "ALL FIGURES ARE PLACEHOLDERS"}` |
| `app/city/[slug]/[hood]/page.tsx` | 140 | DROP PHOTO | `means the text layout simply owns the row (no public "DROP PHOTO" box;` |
| `app/city/[slug]/[hood]/page.tsx` | 746 | PLACEHOLDER | `MARKET FIGURES ARE PLACEHOLDERS — CONNECT MLS` |
| `app/city/[slug]/[hood]/page.tsx` | 746 | CONNECT MLS | `MARKET FIGURES ARE PLACEHOLDERS — CONNECT MLS` |
| `app/city/[slug]/[hood]/page.tsx` | 1177 | PLACEHOLDER | `© MMXXVI · {isLiveMls ? "LISTINGS LIVE FROM NTREIS" : "ALL FIGURES ARE PLACEHOLDERS"}` |
| `app/homes/page.tsx` | 6 | FICTIONAL (mock-inventory banner) | `/* Indexable only on the live NTREIS feed — fictional mock inventory must` |
| `app/homes/page.tsx` | 17 | FICTIONAL (mock-inventory banner) | `fictional mock inventory never gets structured data. */` |
| `components/account/SavedHomesDashboard.tsx` | 273 | PLACEHOLDER | `/* Broadsheet-shaped placeholder while the shelf loads — same row silhouette` |
| `components/admin/AdminLeadList.tsx` | 150 | PLACEHOLDER | `<input value={listing} onChange={(e) => setListing(e.target.value)} placeholder="1176…" style={{ ...select, wi` |
| `components/admin/CommunityBuilder.tsx` | 222 | PLACEHOLDER | `<input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholde` |
| `components/admin/CommunityBuilder.tsx` | 236 | PLACEHOLDER | `<input style={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholde` |
| `components/admin/CommunityBuilder.tsx` | 253 | PLACEHOLDER | `<input style={input} value={form.fromLabel} onChange={(e) => setForm({ ...form, fromLabel: e.target.value })} ` |
| `components/admin/CommunityBuilder.tsx` | 257 | PLACEHOLDER | `<input style={input} value={form.buildersCount} onChange={(e) => setForm({ ...form, buildersCount: e.target.va` |
| `components/admin/CommunityBuilder.tsx` | 261 | PLACEHOLDER | `<input style={input} value={form.buildersLabel} onChange={(e) => setForm({ ...form, buildersLabel: e.target.va` |
| `components/admin/CommunityBuilder.tsx` | 265 | UNVERIFIED | `<div style={label}>Note (short editorial — no unverified claims)</div>` |
| `components/admin/CommunityBuilder.tsx` | 366 | PLACEHOLDER | `<input style={{ ...input, marginBottom: 10 }} placeholder="Reason (optional)" value={archiveFor.notes} onChang` |
| `components/admin/ContentEditor.tsx` | 284 | PLACEHOLDER | `<input style={{ ...input, maxWidth: 220 }} placeholder="Title" value={h.title} onChange={(e) => setForm({ ...f` |
| `components/admin/ContentEditor.tsx` | 285 | PLACEHOLDER | `<input style={input} placeholder="Note" value={h.note} onChange={(e) => setForm({ ...form, highlights: form.hi` |
| `components/admin/ContentEditor.tsx` | 298 | PLACEHOLDER | `<input style={input} placeholder="Question" value={f.q} onChange={(e) => setForm({ ...form, faq: form.faq.map(` |
| `components/admin/ContentEditor.tsx` | 299 | PLACEHOLDER | `<textarea style={{ ...area, minHeight: 56, marginTop: 6 }} placeholder="Answer (min 40 chars)" value={f.a} onC` |
| `components/admin/ContentEditor.tsx` | 337 | PLACEHOLDER | `<input style={{ ...input, marginBottom: 8 }} placeholder="Reason (optional)" value={archiveNotes} onChange={(e` |
| `components/admin/LetterDesk.tsx` | 189 | PLACEHOLDER | `<input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder='e.g. "The week ` |
| `components/admin/LetterDesk.tsx` | 235 | PLACEHOLDER | `<input style={{ ...input, maxWidth: 260 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)` |
| `components/admin/NewBuildControls.tsx` | 115 | PLACEHOLDER | `placeholder={`${r.published ? "UNPUBLISH" : "PUBLISH"} ${r.slug}`}` |
| `components/admin/PhotoReviewQueue.tsx` | 128 | PLACEHOLDER | `? `UNPUBLISHED ${slot.entitySlug}/${slot.slotKey} — placeholder restored (${r.paths?.join(", ")})`` |
| `components/admin/PhotoReviewQueue.tsx` | 454 | PLACEHOLDER | `placeholder="detail (optional)"` |
| `components/admin/PhotoReviewQueue.tsx` | 525 | PLACEHOLDER | `Removes the live photo (placeholder returns after revalidation). The candidate returns to pending; the` |
| `components/admin/PhotoReviewQueue.tsx` | 529 | PLACEHOLDER | `placeholder="notes (optional)"` |
| `components/compliance/DataDisclaimer.tsx` | 3 | PENDING BROKER/LEGAL REVIEW | `PENDING BROKER/NTREIS/LEGAL REVIEW; swap it there once the required` |
| `components/compliance/ListingBrokerAttribution.tsx` | 3 | PENDING BROKER/LEGAL REVIEW | `(PENDING BROKER/NTREIS/LEGAL REVIEW); when the feed supplies neither an` |
| `components/EditorialPhoto.tsx` | 2 | PLACEHOLDER | `the surface's existing placeholder (children) untouched when no approved` |
| `components/EditorialPhoto.tsx` | 29 | PLACEHOLDER | `/* badges rendered over both the photo and the placeholder */` |
| `components/EditorsPicks.tsx` | 16 | PLACEHOLDER | `keys — every pick shares slot_key='pick'). Empty = placeholders. */` |
| `components/Footer.tsx` | 104 | PLACEHOLDER | `: "ALL MARKET FIGURES ARE PLACEHOLDERS"}` |
| `components/HeroSearch.tsx` | 60 | PLACEHOLDER | `placeholder="Search a city, neighborhood, ZIP, or address"` |
| `components/InteractiveMap.tsx` | 584 | PLACEHOLDER | `: "ALL FIGURES ARE PLACEHOLDERS — REPLACE WITH LIVE MLS DATA"}` |
| `components/InteractiveMap.tsx` | 584 | REPLACE WITH LIVE MLS | `: "ALL FIGURES ARE PLACEHOLDERS — REPLACE WITH LIVE MLS DATA"}` |
| `components/listing/ListingPhotoGallery.tsx` | 11 | PLACEHOLDER | `and a counter. Slots fall back to the striped caption placeholder when the` |
| `components/listing/ListingPhotoGallery.tsx` | 153 | PLACEHOLDER | `{/* placeholder always underneath; broken URLs hide themselves */}` |
| `components/NewBuilds.tsx` | 107 | PLACEHOLDER | `counts are {liveMls ? "editorial — verify with sales offices" : "placeholders"}.` |
| `components/Newsletter.tsx` | 127 | PLACEHOLDER | `placeholder="you@northtexas.com"` |
| `components/search/AskQuestionSheet.tsx` | 232 | PLACEHOLDER | `placeholder="Or ask it your way…"` |
| `components/search/AskQuestionSheet.tsx` | 269 | PLACEHOLDER | `placeholder="Your name"` |
| `components/search/AskQuestionSheet.tsx` | 279 | PLACEHOLDER | `placeholder="Your email"` |
| `components/search/AskQuestionSheet.tsx` | 291 | PLACEHOLDER | `placeholder="The number to text you back at"` |
| `components/search/AuthModal.tsx` | 188 | PLACEHOLDER | `placeholder="you@northtexas.com"` |
| `components/search/ListingCardLedger.tsx` | 51 | PLACEHOLDER | `{/* placeholder always renders underneath; a broken CDN URL just` |
| `components/search/MapRoom.tsx` | 179 | PLACEHOLDER | `<span>{isLiveMls ? "LIVE MLS FEED — NTREIS" : "LIVE MLS FEED — PLACEHOLDER"}</span>` |
| `components/search/MapRoom.tsx` | 220 | SAMPLE INVENTORY | `SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED` |
| `components/search/MapRoom.tsx` | 220 | FICTIONAL (mock-inventory banner) | `SAMPLE INVENTORY — EVERY LISTING IS FICTIONAL UNTIL MLS APPROVAL &amp; THE LIVE IDX FEED` |
| `components/search/MapRoom.tsx` | 270 | PLACEHOLDER | `/* Index-shaped placeholder while city counts stream — mirrors the` |
| `components/search/MapRoom.tsx` | 340 | PLACEHOLDER | `/* Rail-shaped placeholder while the ledger streams in — same card` |
| `components/search/MLSComplianceFooter.tsx` | 7 | PENDING BROKER/LEGAL REVIEW | `lib/compliance (PENDING BROKER/NTREIS/LEGAL REVIEW) except the TREC link` |
| `components/search/RequestShowingSheet.tsx` | 243 | PLACEHOLDER | `placeholder="Your name"` |
| `components/search/RequestShowingSheet.tsx` | 249 | PLACEHOLDER | `<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Pho` |
| `components/search/RequestShowingSheet.tsx` | 255 | PLACEHOLDER | `placeholder="Email"` |
| `components/search/RequestShowingSheet.tsx` | 275 | PLACEHOLDER | `placeholder="Anything we should know? (optional)"` |
| `components/search/SearchToolbar.tsx` | 397 | PLACEHOLDER | `placeholder="City, neighborhood, address, or keywords…"` |
| `components/search/SearchToolbar.tsx` | 439 | PLACEHOLDER | `placeholder="No min"` |
| `components/search/SearchToolbar.tsx` | 452 | PLACEHOLDER | `placeholder="No max"` |
| `components/search/SearchToolbar.tsx` | 570 | PLACEHOLDER | `placeholder="No min"` |
| `components/search/SearchToolbar.tsx` | 583 | PLACEHOLDER | `placeholder="No max"` |
| `lib/compliance.ts` | 4 | PENDING BROKER/LEGAL REVIEW | `⚠ PENDING BROKER / NTREIS / COTALITY / LEGAL REVIEW ⚠` |
| `lib/compliance.ts` | 6 | PLACEHOLDER | `Every string in this file is PLACEHOLDER copy drafted in-house from` |
| `lib/compliance.ts` | 20 | PENDING BROKER/LEGAL REVIEW | `export const COMPLIANCE_COPY_STATUS = "PENDING BROKER / NTREIS / LEGAL REVIEW";` |
| `lib/compliance.ts` | 26 | PLACEHOLDER | `mock: "PLACEHOLDER — PENDING MLS APPROVAL",` |
| `lib/compliance.ts` | 26 | PENDING MLS APPROVAL | `mock: "PLACEHOLDER — PENDING MLS APPROVAL",` |
| `lib/compliance.ts` | 31 | PLACEHOLDER | `/** PLACEHOLDER FORM — NTREIS may require different phrasing/placement. */` |
| `lib/compliance.ts` | 40 | PLACEHOLDER | `/** "Deemed reliable" disclaimer — PLACEHOLDER pending required wording. */` |
| `lib/compliance.ts` | 46 | PLACEHOLDER | `/** Data-source / IDX-program disclaimer — PLACEHOLDER pending required wording. */` |
| `lib/compliance.ts` | 56 | PLACEHOLDER | `"All listings shown are fictional placeholders pending the live IDX feed. [Reserved: broker " +` |
| `lib/compliance.ts` | 56 | FICTIONAL (mock-inventory banner) | `"All listings shown are fictional placeholders pending the live IDX feed. [Reserved: broker " +` |
| `lib/content/editorial-photos.ts` | 6 | PLACEHOLDER | `empty map so the surface renders its editorial placeholder, never a` |
| `lib/content/editorial-photos.ts` | 98 | PLACEHOLDER | `console.warn(`editorial photos: read failed (${entityType}) — rendering placeholders`);` |
| `lib/content/editorial-photos.ts` | 117 | PLACEHOLDER | `console.warn(`editorial photos: read aborted (${entityType}) — rendering placeholders`);` |
| `lib/convert/intents.ts` | 27 | PLACEHOLDER | `/** example hint rendered UNDER the field (never placeholder-only) */` |
| `lib/email/letter-issue.ts` | 3 | PLACEHOLDER | `placeholder (%%UNSUB_URL%%) that the send loop substitutes with each` |
| `lib/mls/mock-provider.ts` | 1 | FICTIONAL (mock-inventory banner) | `/* Mock MLS provider — serves the fictional inventory in data/mock-listings.` |
| `lib/mls/trestle.ts` | 15 | PENDING BROKER/LEGAL REVIEW | `// Compliance copy — single source of truth, PENDING BROKER/NTREIS/LEGAL REVIEW` |
| `lib/mls/types.ts` | 101 | PLACEHOLDER | `/** Primary-photo caption shortcut for placeholder slots. */` |
| `lib/mls/types.ts` | 103 | PLACEHOLDER | `/** Feed remarks (RESO PublicRemarks) — placeholder until live data. */` |
| `lib/mls/types.ts` | 129 | PLACEHOLDER | `/** PLACEHOLDER figures from the editorial dataset until live market data. */` |
| `data/mock-listings.ts` | 1 | FICTIONAL (mock-inventory banner) | `/* FAKE mock inventory — fictional addresses and prices ported from the` |

