import { NextResponse } from "next/server";
import { draftMode } from "next/headers";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { pageByRoute } from "@/lib/editor/registry";
import { BUILDER_COOKIE } from "@/lib/editor/builder-mode";

/* Preview Draft — enables Next.js Draft Mode for THIS browser only, after
   re-checking admin auth, then opens the exact public route. The draft
   cookie Next issues is the short-lived, httpOnly bypass token; no draft
   content or reusable secret ever appears in the URL. Anonymous visitors
   never receive the cookie, so they keep seeing the published version.
   Preview responses carry X-Robots-Tag noindex via middleware.

   `builder=1` additionally sets the __bb cookie: the page then renders
   inside the Visual Builder's canvas frame with entry markers + the canvas
   runtime. A plain preview (new tab) CLEARS it, so the two surfaces never
   bleed into each other. */

export const dynamic = "force-dynamic";

async function customPageExists(route: string): Promise<boolean> {
  if (!/^\/[a-z0-9-]+$/.test(route)) return false;
  const db = getSupabaseAdmin();
  if (!db) return false;
  try {
    const { data } = await db.from("editor_pages").select("slug").eq("slug", route.slice(1)).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  const page = pageByRoute(route);
  // admin-created pages live in editor_pages, not the code registry
  if (!page && !(await customPageExists(route))) {
    return NextResponse.json({ ok: false, error: "Unknown route" }, { status: 400 });
  }
  const dest = page?.route ?? route;

  (await draftMode()).enable();
  const target = new URL(dest, req.url);
  const builder = url.searchParams.get("builder") === "1";
  if (builder) {
    // bust the BROWSER's HTTP cache of the public page — without this, a
    // previously-cached anonymous copy can satisfy the redirect and the
    // canvas silently misses its builder render. Public pages never read
    // query params, so the param is inert server-side.
    target.searchParams.set("bbts", Date.now().toString(36));
  }
  const res = NextResponse.redirect(target);
  if (builder) {
    res.cookies.set(BUILDER_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true });
  } else {
    res.cookies.set(BUILDER_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
}
