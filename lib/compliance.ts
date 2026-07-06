/* ============================================================================
   MLS / IDX COMPLIANCE LANGUAGE — SINGLE SOURCE OF TRUTH
   ----------------------------------------------------------------------------
   ⚠ PENDING BROKER / NTREIS / COTALITY / LEGAL REVIEW ⚠

   Every string in this file is PLACEHOLDER copy drafted in-house from
   common IDX practice. It is NOT the final wording required by the NTREIS
   IDX display rules or the Trestle data-license agreement. Before public
   launch is considered compliant, the sponsoring broker and NTREIS/Cotality
   must supply or approve the exact required language — then update it HERE,
   once, and every card, dossier, and footer follows.

   The ONE exception: TREC link labels (components/TrecLinks.tsx) are
   regulator-mandated verbatim text (22 TAC §531.18/§531.20) and are final.

   Client-safe: strings only, no secrets, importable from either side.
   ========================================================================== */

/** Rendered nowhere — a grep-able marker and checklist anchor. */
export const COMPLIANCE_COPY_STATUS = "PENDING BROKER / NTREIS / LEGAL REVIEW";

/** MLS source labels shown beside listings and in footers. */
export const MLS_SOURCE = {
  live: "NTREIS",
  liveLong: "NTREIS IDX",
  mock: "PLACEHOLDER — PENDING MLS APPROVAL",
} as const;

/* ---- listing-broker attribution (per-listing display requirement) ---- */

/** PLACEHOLDER FORM — NTREIS may require different phrasing/placement. */
export const attributionLine = (officeName: string) => `Listing courtesy of ${officeName}`;

export const ATTRIBUTION_RESERVED_SINGLE = "LISTING COURTESY OF — IDX ATTRIBUTION RESERVED";
export const ATTRIBUTION_RESERVED_GROUP =
  "LISTINGS COURTESY OF PARTICIPATING BROKERAGES — IDX ATTRIBUTION RESERVED";

/* ---- disclaimers ---- */

/** "Deemed reliable" disclaimer — PLACEHOLDER pending required wording. */
export const DEEMED_RELIABLE_DISCLAIMER =
  "Listing information provided by North Texas Real Estate Information Systems, Inc. (NTREIS). " +
  "Information is deemed reliable but is not guaranteed and should be independently verified. " +
  "Data may not reflect all real estate activity in the market. Copyright NTREIS. All rights reserved.";

/** Data-source / IDX-program disclaimer — PLACEHOLDER pending required wording. */
export const DATA_SOURCE_DISCLAIMER =
  "Listing information is provided through the Internet Data Exchange (IDX) program of North Texas " +
  "Real Estate Information Systems, Inc. (NTREIS). Real estate listings held by brokerage firms other " +
  "than the site owner are identified with the name of the listing brokerage. Information is deemed " +
  "reliable but is not guaranteed and should be independently verified. Data may not reflect all real " +
  "estate activity in the market. Copyright NTREIS. All rights reserved.";

/** Mock-mode footer text — never ships on live data. */
export const MOCK_FOOTER_DISCLAIMER =
  "All listings shown are fictional placeholders pending the live IDX feed. [Reserved: broker " +
  "identification · “Listings courtesy of the North Texas Real Estate Information Systems (NTREIS) " +
  "IDX program” · information is deemed reliable but not guaranteed and should be independently " +
  "verified · listings marked with the IDX logo are held by brokerage firms other than the site owner.]";

/** Dossier fallback when a listing row carries no disclaimerText. */
export const DISCLAIMER_RESERVED =
  "DISCLAIMER RESERVED — DEEMED RELIABLE, NOT GUARANTEED (LIVE FEED)";

/* ---- last-updated stamp ---- */

export const formatUpdatedStamp = (iso: string) =>
  new Date(iso)
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    })
    .toUpperCase() + " CT";
