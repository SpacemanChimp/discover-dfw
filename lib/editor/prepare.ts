/* Amendment 5's PREPARE FOR EXPORT validator — PURE (no React, no server
   imports, no database), so the complete gate is deterministic and
   fixture-testable (scripts/tests/prepare-community.test.mjs). The API
   route gathers the rows and passes them in; every rule and message lives
   HERE. Blockers carry the studio tab that fixes them.

   The stamp-freshness rule is here too: PREPARED is a DERIVED state — an
   audited verification stamp counts only while it is newer than every
   later facts/content/layout edit, so nothing can ever look prepared while
   an unvalidated change is sitting in the workspace. */

import { sanitizeLayout, hoodGalleryFromLayout, TEMPLATE_SECTIONS, type LayoutDoc } from "./blocks.ts";
import { validateClaims } from "./doc.ts";

export interface PrepareBlocker {
  tab: string;
  message: string;
}

export interface PrepareInput {
  draft: {
    type: "hood" | "new_build";
    name: string;
    slug: string;
    lifecycle: string;
    statusLabel: string | null;
    fromLabel: string | null;
    buildersCount: number | null;
    buildersLabel: string | null;
    hasMlsSnapshot: boolean;
  };
  /** the draft's city resolves in the canonical dataset */
  cityCanonical: boolean;
  /** CB-3a content state — lint errors come from the strict export lint */
  content: { exists: boolean; ready: boolean; lintErrors: { field: string; message: string }[] };
  /** the community's hero photo_slot is APPROVED (Photo Desk CI-6) */
  heroApproved: boolean;
  /** route-keyed editor DRAFT documents (__layout + canvas text regions) */
  routeDrafts: { regionKey: string; contentJson?: unknown; contentText: string | null }[];
  /** slot keys with an APPROVED gallery asset for this community */
  approvedGallerySlots: Set<string>;
  citySlugs: string[];
  supabaseUrl?: string;
}

export function prepareBlockers(input: PrepareInput): PrepareBlocker[] {
  const blockers: PrepareBlocker[] = [];
  const d = input.draft;

  /* identity */
  if (!input.cityCanonical) blockers.push({ tab: "identity", message: "City is not a canonical DFW city" });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) blockers.push({ tab: "identity", message: `Slug "${d.slug}" is not canonical (lowercase, single hyphens)` });
  if (!String(d.name ?? "").trim()) blockers.push({ tab: "identity", message: "The community needs a name" });

  /* lifecycle position */
  if (d.lifecycle !== "ready") {
    blockers.push({ tab: "preview", message: "The community is not marked READY — pass the readiness gates and MARK READY first" });
  }

  /* facts + MLS evidence */
  if (d.type === "new_build") {
    if (!String(d.statusLabel ?? "").trim()) blockers.push({ tab: "facts", message: "Sales status not set — the hero would render STATUS NOT SET" });
    if (!String(d.fromLabel ?? "").trim()) blockers.push({ tab: "facts", message: "Pricing FROM label not set — the hero would render $— (not set)" });
    if (d.buildersCount == null && !String(d.buildersLabel ?? "").trim()) {
      blockers.push({ tab: "facts", message: "Builder claim unverified — set a verified count or a generic label" });
    }
  }
  if (!d.hasMlsSnapshot) blockers.push({ tab: "facts", message: "MLS lookup evidence not frozen on the draft" });

  /* content + SEO + claims — the exporter's own strict lint (run upstream) */
  if (!input.content.exists) {
    blockers.push({ tab: "content", message: "No page content drafted" });
  } else {
    if (!input.content.ready) blockers.push({ tab: "content", message: "Content is not marked READY (server lint sign-off)" });
    for (const e of input.content.lintErrors) blockers.push({ tab: "content", message: `${e.field}: ${e.message}` });
  }

  /* photos */
  if (!input.heroApproved) blockers.push({ tab: "photos", message: "No approved hero photo (Photo Desk CI-6 approval required)" });

  /* layout + canvas text drafts on the FUTURE route — publish-grade checks */
  for (const doc of input.routeDrafts) {
    if (doc.regionKey === "__layout") {
      const s = sanitizeLayout(doc.contentJson, {
        pageKind: "template",
        sections: TEMPLATE_SECTIONS["template:hood"],
        supabaseUrl: input.supabaseUrl,
        requireImageAlt: true,
        citySlugs: input.citySlugs,
      });
      for (const e of s.errors) blockers.push({ tab: "arrange", message: `layout: ${e}` });
      for (const e of validateClaims(s.ok ? s.text : String(doc.contentText ?? ""))) blockers.push({ tab: "arrange", message: `layout: ${e}` });
      const galleryOrder = s.ok && s.doc ? hoodGalleryFromLayout(s.doc as LayoutDoc) : null;
      if (galleryOrder) {
        for (const k of galleryOrder) {
          if (!input.approvedGallerySlots.has(k)) {
            blockers.push({ tab: "photos", message: `gallery entry "${k}" has no APPROVED photo — approve it or remove it from the order` });
          }
        }
      }
    } else {
      // canvas text/tagline drafts: the claims linter is the publication risk
      for (const e of validateClaims(String(doc.contentText ?? ""))) {
        blockers.push({ tab: "arrange", message: `“${doc.regionKey}” canvas draft: ${e}` });
      }
    }
  }

  return blockers;
}

/** A prepare stamp counts only while it is newer than EVERY later edit —
    null/absent timestamps are ignored (no edit on that axis). ISO-8601
    strings compare lexicographically. */
export function preparedStampFresh(stamp: string | null | undefined, editTimestamps: (string | null | undefined)[]): boolean {
  if (!stamp) return false;
  return editTimestamps.every((t) => !t || stamp >= t);
}
