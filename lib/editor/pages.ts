/* Admin-created page store reads — SERVER-ONLY, fail-open like every other
   editor reader: a DB failure means "no such page" (404), never a broken
   render of anything that exists in code. */
import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/db/admin";
import type { LayoutDoc } from "./blocks.ts";

export interface EditorPageMeta {
  slug: string;
  title: string;
  template: string;
  status: "draft" | "published";
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  nav_label: string | null;
  show_in_nav: boolean;
  header_footer: boolean;
  published_at: string | null;
}

export async function getEditorPage(slug: string): Promise<EditorPageMeta | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("editor_pages")
      .select("slug, title, template, status, seo_title, seo_description, og_image_url, nav_label, show_in_nav, header_footer, published_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as EditorPageMeta;
  } catch {
    return null;
  }
}

/** published pages only — sitemap + navigation candidates (tag-cached) */
export const publishedPagesTag = "editor:published-pages";
export async function getPublishedPages(): Promise<EditorPageMeta[]> {
  const cached = unstable_cache(
    async () => {
      const db = getSupabaseAdmin();
      if (!db) return [];
      try {
        const { data, error } = await db
          .from("editor_pages")
          .select("slug, title, template, status, seo_title, seo_description, og_image_url, nav_label, show_in_nav, header_footer, published_at")
          .eq("status", "published")
          .order("created_at", { ascending: true });
        if (error || !data) return [];
        return data as EditorPageMeta[];
      } catch {
        return [];
      }
    },
    ["editor-published-pages"],
    { revalidate: 300, tags: [publishedPagesTag] }
  );
  try {
    return await cached();
  } catch {
    return [];
  }
}

/** a page's layout (published pointer, or draft when previewing) */
export async function getPageLayout(slug: string, preview: boolean): Promise<LayoutDoc | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("editor_documents")
      .select(
        "published:editor_versions!editor_documents_published_fk(content_json)," +
          "draft:editor_versions!editor_documents_draft_fk(content_json)"
      )
      .eq("route", "/" + slug)
      .eq("region_key", "__layout")
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as { published: { content_json: unknown } | null; draft: { content_json: unknown } | null };
    const json = preview ? (row.draft?.content_json ?? row.published?.content_json) : row.published?.content_json;
    if (!json || (json as LayoutDoc).type !== "layout") return null;
    return json as LayoutDoc;
  } catch {
    return null;
  }
}
