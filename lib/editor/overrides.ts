/* Published-override reader for public pages — SERVER-ONLY.

   THE CONTRACT: this module may never break a public page. Every failure
   path (tables missing before migration 0018, DB unreachable, bad rows)
   returns an empty region map so the caller renders its existing code
   fallback exactly as today. One batched query per route — never one per
   region or paragraph.

   Draft content is returned ONLY when Next.js Draft Mode is enabled for
   the request — and the draft cookie is only ever issued by the admin-
   gated preview route. Published reads are cached per-route with a tag
   (`editor:<route>`) that publish/restore invalidates alongside
   revalidatePath. */
import "server-only";
import { draftMode } from "next/headers";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { resolveRegions, type RegionRow, type ResolvedRegion } from "./doc";

export const editorTag = (route: string) => `editor:${route}`;

interface VersionCols {
  content_type: RegionRow["content_type"];
  content_json: unknown;
  seo_title: string | null;
  seo_description: string | null;
}

async function fetchRows(route: string, includeDrafts: boolean): Promise<RegionRow[] | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("editor_documents")
      .select(
        "region_key," +
          "published:editor_versions!editor_documents_published_fk(content_type,content_json,seo_title,seo_description)," +
          "draft:editor_versions!editor_documents_draft_fk(content_type,content_json,seo_title,seo_description)"
      )
      .eq("route", route);
    if (error || !data) return null;
    const rows: RegionRow[] = [];
    for (const d of data as unknown as { region_key: string; published: VersionCols | null; draft: VersionCols | null }[]) {
      if (d.published) {
        rows.push({
          region_key: d.region_key,
          content_type: d.published.content_type,
          content_json: d.published.content_json,
          seo_title: d.published.seo_title,
          seo_description: d.published.seo_description,
          is_draft: false,
        });
      }
      if (includeDrafts && d.draft) {
        rows.push({
          region_key: d.region_key,
          content_type: d.draft.content_type,
          content_json: d.draft.content_json,
          seo_title: d.draft.seo_title,
          seo_description: d.draft.seo_description,
          is_draft: true,
        });
      }
    }
    return rows;
  } catch {
    return null; // fail open — code fallback renders
  }
}

export interface EditorState {
  preview: boolean;
  regions: Record<string, ResolvedRegion>;
}

/** One call per instrumented route render. Published-only outside preview
    (cached); published+draft inside an authenticated preview (uncached,
    request-scoped). */
export async function getEditorState(route: string): Promise<EditorState> {
  let preview = false;
  try {
    preview = (await draftMode()).isEnabled;
  } catch {
    preview = false;
  }
  try {
    if (preview) {
      const rows = await fetchRows(route, true);
      return { preview: true, regions: resolveRegions(rows, true) };
    }
    const cached = unstable_cache(() => fetchRows(route, false), ["editor-overrides", route], {
      revalidate: 300,
      tags: [editorTag(route)],
    });
    const rows = await cached();
    return { preview: false, regions: resolveRegions(rows, false) };
  } catch {
    return { preview, regions: {} };
  }
}

/** ADMIN-ONLY: draft-inclusive region state for a route with NO public page
    yet (Community Studio future routes). No draftMode() gate — the caller
    must already be behind the admin allowlist. Uncached by design: the
    private preview always shows the latest saved documents. */
export async function getDraftedRegions(route: string): Promise<Record<string, ResolvedRegion>> {
  try {
    const rows = await fetchRows(route, true);
    return resolveRegions(rows, true);
  } catch {
    return {};
  }
}

/** SEO override for a page: the seo-carrying region's published (or, in
    preview, draft) values. Falls back to nulls — callers keep their code
    metadata when absent. */
export function seoFrom(state: EditorState, regionKey: string): { title: string | null; description: string | null } {
  const r = state.regions[regionKey];
  return { title: r?.seoTitle ?? null, description: r?.seoDescription ?? null };
}
