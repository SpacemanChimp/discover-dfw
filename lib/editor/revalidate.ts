/* Revalidation fan-out for every editor document family — SERVER-ONLY.
   Publishing/restoring/rolling back must refresh exactly the affected
   surfaces: a single page, a shared dynamic template (every page under
   it), the navigation shell, or an admin-created page (+ sitemap). Failure
   is returned, never thrown — callers report it and offer Heal. */
import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pageByRoute } from "./registry";
import { editorTag } from "./overrides";
import { publishedPagesTag } from "./pages";

export async function revalidateEditorTarget(
  db: SupabaseClient,
  route: string
): Promise<{ revalidated: boolean; revalidateError: string | null }> {
  try {
    revalidateTag(editorTag(route));
    if (route === "template:city") {
      revalidatePath("/city/[slug]", "page");
    } else if (route === "template:hood") {
      revalidatePath("/city/[slug]/[hood]", "page");
    } else if (route === "__site") {
      // navigation renders on the homepage shell, research page, and every
      // published builder page
      revalidatePath("/");
      revalidatePath("/how-we-research");
      const { data } = await db.from("editor_pages").select("slug").eq("status", "published");
      for (const p of data ?? []) revalidatePath(`/${p.slug}`);
    } else {
      const page = pageByRoute(route);
      if (page) {
        for (const p of page.revalidatePaths) revalidatePath(p);
      } else {
        // admin-created page
        revalidatePath(route);
        revalidateTag(publishedPagesTag);
        revalidatePath("/sitemap.xml");
      }
    }
    return { revalidated: true, revalidateError: null };
  } catch (e) {
    return { revalidated: false, revalidateError: e instanceof Error ? e.message : String(e) };
  }
}
