/* Community Builder (CB-1) — draft records, SERVER-ONLY.

   Drafts are a workspace: nothing public reads them. Publishing is the
   separately-gated CB-2 exporter (not yet implemented) which writes
   lib/dfw.data.json on a reviewed branch — the JSON stays the single
   source of truth for pages. This module owns the draft types, the list
   reader for /admin/communities, and the collision rules that keep a
   draft from ever shadowing an existing page. */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { cities, newBuilds } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/slug";

export const DRAFT_STATUS_LABELS = ["NOW SELLING", "MODELS OPEN", "FINAL PHASE", "SOLD OUT"] as const;
export type DraftStatusLabel = (typeof DRAFT_STATUS_LABELS)[number];
export type DraftType = "hood" | "new_build";
export type DraftLifecycle = "draft" | "ready" | "exported" | "live" | "archived";

export type CommunityDraft = {
  id: string;
  type: DraftType;
  name: string;
  citySlug: string;
  slug: string;
  statusLabel: DraftStatusLabel | null;
  fromLabel: string | null;
  buildersCount: number | null;
  buildersLabel: string | null;
  note: string | null;
  readyForExport: boolean;
  lifecycle: DraftLifecycle;
  mlsSnapshot: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type DraftRow = {
  id: string;
  type: DraftType;
  name: string;
  city_slug: string;
  slug: string;
  status_label: DraftStatusLabel | null;
  from_label: string | null;
  builders_count: number | null;
  builders_label: string | null;
  note: string | null;
  ready_for_export: boolean;
  lifecycle: DraftLifecycle;
  mls_snapshot_json: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function fromRow(r: DraftRow): CommunityDraft {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    citySlug: r.city_slug,
    slug: r.slug,
    statusLabel: r.status_label,
    fromLabel: r.from_label,
    buildersCount: r.builders_count,
    buildersLabel: r.builders_label,
    note: r.note,
    readyForExport: r.ready_for_export,
    lifecycle: r.lifecycle,
    mlsSnapshot: r.mls_snapshot_json,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Non-archived drafts, newest activity first. Empty list when the table
    doesn't exist yet (0012 not applied) — the page still renders. */
export async function getCommunityDrafts(): Promise<CommunityDraft[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("community_drafts")
      .select(
        "id, type, name, city_slug, slug, status_label, from_label, builders_count, builders_label, note, ready_for_export, lifecycle, mls_snapshot_json, created_by, created_at, updated_at"
      )
      .neq("lifecycle", "archived")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as DraftRow[]).map(fromRow);
  } catch {
    return [];
  }
}

/* ---- collision rules -------------------------------------------------------

   A draft's (city, slug) must not shadow anything that already renders or
   is already drafted. Checked in three layers: this function (dataset),
   a live-drafts query in the route handler, and the DB's partial unique
   index as the last line. The dataset check ALSO blocks the six deferred
   existing-hood communities (Devonshire, Mustang Lakes, Star Trail,
   Cambridge Crossing, Silverado, Monterra) automatically — they are hood
   entries in dfw.data.json, and stay blocked until the hood/newBuild
   precedence question is resolved as its own phase. */

export type SlugCollision =
  | { kind: "unknown_city" }
  | { kind: "bad_slug"; expected: string }
  | { kind: "existing_hood"; hoodName: string }
  | { kind: "existing_new_build"; nbName: string };

export function findDatasetCollision(citySlug: string, slug: string): SlugCollision | null {
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) return { kind: "unknown_city" };
  // the slug must be a fixed point of slugifyHood — anything else can't be routed
  const canonical = slugifyHood(slug);
  if (!slug || canonical !== slug) return { kind: "bad_slug", expected: canonical };
  for (const [hoodName] of city.hoods) {
    if (slugifyHood(hoodName) === slug) return { kind: "existing_hood", hoodName };
  }
  for (const nb of newBuilds) {
    if (nb.city === citySlug && slugifyHood(nb.name) === slug) return { kind: "existing_new_build", nbName: nb.name };
  }
  return null;
}

export function collisionMessage(c: SlugCollision, citySlug: string, slug: string): string {
  switch (c.kind) {
    case "unknown_city":
      return `Unknown city "${citySlug}" — the dataset is the curated city list.`;
    case "bad_slug":
      return `Slug "${slug}" is not canonical — use "${c.expected}".`;
    case "existing_hood":
      return `"${citySlug}/${slug}" already renders as the hood "${c.hoodName}". Existing hoods (including the six deferred new-build conversions) are blocked until precedence is resolved.`;
    case "existing_new_build":
      return `"${citySlug}/${slug}" already renders as the new-build community "${c.nbName}".`;
  }
}

/** City options for the portal dropdown — slug + display name only. */
export function cityOptions(): { slug: string; name: string }[] {
  return cities.map((c) => ({ slug: c.slug, name: c.name }));
}
