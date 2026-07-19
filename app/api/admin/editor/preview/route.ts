import { NextResponse } from "next/server";
import { draftMode } from "next/headers";
import { getAdminUser } from "@/lib/admin";
import { pageByRoute } from "@/lib/editor/registry";

/* Preview Draft — enables Next.js Draft Mode for THIS browser only, after
   re-checking admin auth, then opens the exact public route. The draft
   cookie Next issues is the short-lived, httpOnly bypass token; no draft
   content or reusable secret ever appears in the URL. Anonymous visitors
   never receive the cookie, so they keep seeing the published version.
   Preview responses carry X-Robots-Tag noindex via middleware. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  const page = pageByRoute(route);
  if (!page) return NextResponse.json({ ok: false, error: "Unknown route" }, { status: 400 });

  (await draftMode()).enable();
  return NextResponse.redirect(new URL(page.route, req.url));
}
