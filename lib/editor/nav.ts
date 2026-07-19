/* Published navigation reader — SERVER-ONLY, fail-open: any miss or
   failure returns null and components/Nav.tsx renders its code-owned
   LINKS exactly as today. The nav document is versioned/audited through
   the same editor store ('__site' / 'nav'); only the PUBLISHED version is
   ever read here. */
import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/db/admin";
import type { NavItem } from "./blocks.ts";

export async function getPublishedNav(): Promise<NavItem[] | null> {
  const cached = unstable_cache(
    async () => {
      const db = getSupabaseAdmin();
      if (!db) return null;
      try {
        const { data, error } = await db
          .from("editor_documents")
          .select("published:editor_versions!editor_documents_published_fk(content_json)")
          .eq("route", "__site")
          .eq("region_key", "nav")
          .maybeSingle();
        if (error || !data) return null;
        const json = (data as unknown as { published: { content_json: unknown } | null }).published?.content_json as
          | { type?: string; items?: NavItem[] }
          | undefined;
        if (!json || json.type !== "nav" || !Array.isArray(json.items)) return null;
        return json.items;
      } catch {
        return null;
      }
    },
    ["editor-published-nav"],
    { revalidate: 300, tags: ["editor:__site"] }
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}
