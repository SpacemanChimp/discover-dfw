# School data — matching & selection report (launch-safe pass)

**Date:** 2026-07-13 · **Author:** automated pass (Claude), read-only against the live feed
**Rule enforced everywhere:** listing pages show only what the MLS record reports; hood pages show *nearby* schools, never assigned/zoned claims. No paid APIs, no DB writes, no invented schools.

---

## Part A — MLS-reported schools (listing pages)

### Fields found on the NTREIS Trestle feed (probed 2026-07-13, read-only)

`$metadata` on the `Property` resource exposes these school fields:

| Field | Populated? |
| --- | --- |
| `ElementarySchool` | yes — short campus name, e.g. "Sharon Shannon" |
| `ElementarySchoolDistrict` | yes — e.g. "Rockwall ISD" |
| `MiddleOrJuniorSchool` | yes — e.g. "Herman E Utley" |
| `MiddleOrJuniorSchoolDistrict` | yes |
| `HighSchool` | yes — e.g. "Rockwall-Heath" |
| `HighSchoolDistrict` | yes |
| `DistanceToSchools*`, `DistanceToSchoolBus*` | present in schema, null in every sampled record — not used |

### Coverage (active listings, feed queries 2026-07-13)

| Scope | Total active | With `ElementarySchool` | With `HighSchool` |
| --- | --- | --- | --- |
| Feed-wide (all North Texas) | 81,651 | 78,791 (96.5%) | 78,776 (96.5%) |
| Rockwall | 589 | 577 (98.0%) | 577 |
| Dallas | 6,598 | 6,491 (98.4%) | 6,479 |
| Fort Worth | 5,154 | 5,080 (98.6%) | 5,080 |
| Farmersville | 314 | 302 (96.2%) | 304 |
| Northlake | 243 | 243 (100%) | 243 |

**Missing cases are almost entirely commercial/land** — sampled null-school records were `CommercialSale/UnimprovedLand`, `CommercialLease/Office`, `CommercialSale/Office`. For these the UI shows "School information not reported on this listing." — nothing is invented.

### Sample listings with complete school fields (live records)

| ListingId | City | Elementary | Middle | High | District |
| --- | --- | --- | --- | --- | --- |
| 21329730 | Rockwall | Sharon Shannon | Herman E Utley | Rockwall-Heath | Rockwall ISD |
| 21328174 | Rockwall | Sharon Shannon | Herman E Utley | Rockwall-Heath | Rockwall ISD |
| 21329450 | Rockwall | Celia Hays | JW Williams | Rockwall | Rockwall ISD |

### Data path

- `lib/mls/school-fields.ts` — shared RESO field list + mapper (`schoolsFromReso`).
- Trestle provider: school fields added to `$select`; mapped onto `Listing.schools`.
- Local (replica) provider: derives `Listing.schools` from the stored `raw` payload — same "derived scalars off raw" pattern already used for DOM/price history.
- **Gap:** rows replicated before this change lack school fields in `raw` (the sync stores selected fields only). Until a full backfill (`/api/mls/sync?full=1` — **not run; DB writes need separate approval**), listing detail pages supplement with a live six-field `$select` fetch per listing (6-hour cache, degrades to null, never fails the page).
- Sync job `$select` now includes the six fields, so naturally-churning listings pick them up over time even without the backfill.

### Ratings on listing pages: deliberately NOT shown

MLS school names are short/informal ("Sharon Shannon", "JW Williams"). Mapping them to TEA campuses would need fuzzy matching; per the launch rule (no ratings unless campus/district match confidence is high), listing pages show **names + district only**, with the verify-with-the-district line and "AS REPORTED ON THE MLS RECORD — NOT A BOUNDARY DETERMINATION". A future exact-match layer (normalized name + district equality against the TEA directory) can add ratings where the match is exact; anything less is rejected.

**Match-confidence precedent** (from the 2026-07-13 TEA ratings backfill of the editorial dataset, same normalizer):
- Accepted exact: "Rockwall High School" → TEA `Rockwall HS` (same district, normalized-equal).
- Accepted formal-name variant (manually reviewed): "L.D. Bell High School" → `Bell HS` @ Hurst-Euless-Bedford ISD.
- **Rejected** fuzzy: "Aubrey Middle School" → `Aubrey HS` (level conflict — replaced with the real `Terrie McNabb MS` after manual review).
- **Rejected** stale campus: "Stewart's Creek Elementary" → nearest fuzzy hit `Timber Creek Elem` refused; campus was closed by Lewisville ISD, entry replaced.

---

## Part B — Nearby schools (hood / new-build pages)

### Source & method

- **Source:** TEA campus directory + 2025 A–F accountability ratings — the same flat file txschools.gov serves (`https://txschools.gov/data/schools.json`). Free, public, no key. Retrieved 2026-07-13.
- **Coordinates:** TEA provides campus lat/lon. Hoods do **not** have their own coordinates in this codebase, so distances are measured from the **city centroid** (`cities[].ll`) and the UI labels every distance "X.X MI FROM {CITY} CENTER" — no hood-level precision is claimed. (Per spec: hood centroid *or city coordinates if available* — city coordinates are what exists; we did not guess hood coords.)
- **Eligibility filters:** DFW education regions (10/11) · `entity_type=Traditional` · enrollment types 01/02 (zoned) + 05 (combined-enrollment comprehensives — W.T. White, Pearce, Carter-Riverside code 05 because they host magnet programs) · rated A–F · ≥200 students (drops 61-student alternative academies) · not online · not PK/K-only centers · has coordinates. Charters (03), selective magnets (04/07), special-assignment (06) excluded.
- **Selection:** nearest eligible campus per level (elementary / middle / high); a campus in the city's own district wins over a marginally-closer out-of-district campus within 15 mi. Out-of-district picks are kept and labeled with their real district (they are "nearby", never "assigned").
- **Output:** `lib/content/nearby-schools.json` (90 cities × 3 picks), rebuilt by `node scripts/build-nearby-schools.mjs`.

### Requested page samples (from the generated dataset, retrieved 2026-07-13)

**Rockwall — The Harbor district** (`/city/rockwall/the-harbor-district`)
| Campus | Level | District | Rating | Distance | Why selected |
| --- | --- | --- | --- | --- | --- |
| Howard Dobbs Elem | Elementary | Rockwall ISD | B | 0.4 mi | nearest rated Rockwall ISD elementary to city center |
| Herman E Utley MS | Middle | Rockwall ISD | B | 1.1 mi | nearest rated Rockwall ISD middle |
| Rockwall HS | High | Rockwall ISD | A | 1.8 mi | nearest rated comprehensive high (61-student Quest Academy filtered by size floor) |

**Dallas — Lakewood** (`/city/dallas/lakewood`) — city-centroid caveat applies most here; distances are from downtown Dallas, not Lakewood itself
| Campus | Level | District | Rating | Distance |
| --- | --- | --- | --- | --- |
| Downtown Montessori at Ida B Wells Academy | Elementary | Dallas ISD | A | 0.3 mi |
| Billy Earl Dade MS | Middle | Dallas ISD | B | 1.4 mi |
| James Madison HS | High | Dallas ISD | B | 1.9 mi |

**Fort Worth — Fairmount** (`/city/fort-worth/fairmount`) — same caveat (measured from downtown FW)
| Campus | Level | District | Rating | Distance |
| --- | --- | --- | --- | --- |
| Charles Nash Elem | Elementary | Fort Worth ISD | C | 0.5 mi |
| Elder MS | Middle | Fort Worth ISD | C | 2.4 mi |
| Carter-Riverside HS | High | Fort Worth ISD | C | 2.7 mi (comprehensive; enrollment-type 05) |

**Farmersville — LakeHaven** (new-build, `/city/farmersville/lakehaven`)
| Campus | Level | District | Rating | Distance |
| --- | --- | --- | --- | --- |
| Tatum Elem | Elementary | Farmersville ISD | B | 0.4 mi |
| Farmersville JH | Middle | Farmersville ISD | B | 0.9 mi |
| Farmersville HS | High | Farmersville ISD | A | 0.7 mi |

**Northlake — Pecan Square** (new-build, `/city/northlake/pecan-square`)
| Campus | Level | District | Rating | Distance |
| --- | --- | --- | --- | --- |
| Johnie R Daniel Elem | Elementary | Northwest ISD | A | 2.7 mi |
| Gene Pike MS | Middle | Northwest ISD | B | 7.9 mi (in Justin — nearest rated NISD middle; labeled, not assigned) |
| Northwest HS | High | Northwest ISD | C | 7.8 mi (in Justin) |

**Edge case worth knowing:** Melissa's middle pick is `Clemons Creek MS` (Anna ISD, 3.1 mi, out-of-district-labeled) because TEA carries no rated Melissa ISD middle campus — honest "nearby" beats inventing one. Dataset-wide: no pick exceeds 10 mi; exactly one of 270 picks is out-of-district.

---

## Wording & schema compliance

- Hood module heading: "A few schools near {hood}." · subcopy: "School assignments can vary by address. Use this as nearby context, then verify current boundaries with the district."
- Listing module heading: "Schools reported for this listing" · subcopy: "School information comes from the MLS listing record. Verify current assignments with the district before relying on them."
- City page heading changed: "Zoned to {ISD}." → **"A few schools in {ISD}."** (the only public "zoned to" in the codebase).
- No JSON-LD/schema was added for schools anywhere; existing structured data makes no school-assignment claims.
- The content-drafts pipeline already hard-blocks `zoned to / zoned for / attendance zones? / feeds? into / assigned to` via regex (`lib/content/community-content-drafts.ts`) — human-gated DB content is screened at the door.

## Forbidden-wording sweep (Part D)

Grep targets: `zoned to`, `attendance zone(s)`, `feeds into`, `assigned to`, `ratings are placeholders`, `placeholder` — across `app/`, `components/`, `lib/`, `data/`, `public/` and rendered sample pages.

| Location | Found | Action |
| --- | --- | --- |
| `app/city/[slug]/page.tsx` heading | "Zoned to {ISD}." | → "A few schools in {ISD}." |
| `lib/hood-content.json` (hood FAQ/notes, renders publicly + FAQ JSON-LD) | 49× "zoned to", 28× "attendance zone(s)", 2× school "feed(s) into" | 75 lines rewritten: "zoned to"→"served by" (district membership, not assignment); "attendance zones"→"school boundaries"; "attendance zone"→"campus assignment"; the 2 school "feeds into"→"is served by". All cautionary verify-with-the-district sentences preserved. JSON revalidated. |
| `lib/hood-content.json` trail sentence ("trail … feeds into the broader path network") | 1× "feeds into" | kept — not a school claim |
| "guaranteed" (2×: golf sightlines; "stable isn't the same as guaranteed — confirm with the district") | — | kept — not school-assignment claims (the second explicitly refuses to guarantee) |
| City page sparkline note | "ILLUSTRATIVE CURVE · PLACEHOLDER" (always rendered) | → "ILLUSTRATIVE CURVE · EDITORIAL ESTIMATE" |
| Hood new-build pill | "PLACEHOLDERS — VERIFY WITH SALES OFFICES" (always rendered) | → "EDITORIAL FIGURES — VERIFY WITH SALES OFFICES" |
| Remaining "PLACEHOLDER" strings in `app/`, `components/` | all gated behind `!isLiveMls` (mock-mode fallbacks) or Letter-email internals | kept — never render on the live site (`MLS_PROVIDER=local` ⇒ live); honest labeling if the feed is ever switched off |
| `lib/content/community-content-drafts.ts` regex guard | contains the phrases as a *blocklist* | kept — it's the pipeline guard that rejects zoning claims in new content |

## Validation results (Part D, 2026-07-13)

- **Build:** clean (`npm run build`, exit 0, 585 static pages; one pre-existing unrelated build-log warning about editorial photos).
- **Rendered-page sweep** (dev server, raw HTML incl. JSON-LD): `/city/rockwall`, `/city/rockwall/the-harbor-district`, `/city/dallas/lakewood`, `/city/fort-worth/fairmount`, `/city/farmersville/lakehaven`, `/city/northlake/pecan-square` — zero hits for `zoned to`, `attendance zone(s)`, `ratings are placeholders`, `placeholder`.
- **Listing sample** `/listing/1176967782` (Rockwall): shows MLS-reported schools via the live supplement path — Sharon Shannon / Herman E Utley / Rockwall-Heath / Rockwall ISD — with required heading/subcopy. **Known exception:** the broker's own `PublicRemarks` on this listing contain "zoned to sought-after Rockwall ISD". That is quoted MLS feed content displayed under IDX rules, not site editorial; we do not rewrite broker remarks. Flagged for a policy decision if stricter filtering is wanted.
- **Partial fields** `/listing/1159929417` (Terrell land): record reports only middle/high — card renders exactly those two rows plus district; nothing invented.
- **Empty case:** feed queries found zero active *residential* listings without school fields in sampled cities (coverage is that complete); the "School information not reported on this listing." branch exists for records whose live supplement also returns nothing, and the whole section is hidden off-live (mock mode).
- **Hidden-section behavior:** hood module renders only when the dataset has entries for the city (all 90 cities currently have 3).
- **Schema:** no structured data added for schools; existing JSON-LD carries no assignment claims (FAQ text was cleansed with the content sweep).
- Console: no errors on verified pages. Browser screenshots were not capturable in this session (capture pipeline timeout — pages healthy, verified via rendered text); re-run screenshots before publishing marketing material if needed.

## Not done (needs separate approval)

- **Full MLS backfill** to land school fields in the replica `raw` for existing rows (DB writes). Until then listing pages use the live supplement fetch.
- Ratings on listing pages via exact TEA matching (deferred as above).
- Hood-level coordinates (would sharpen "nearby" for big-city hoods like Lakewood/Fairmount; needs a geocoding decision).
