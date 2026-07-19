import { NextResponse } from "next/server";
import { draftMode } from "next/headers";
import { BUILDER_COOKIE } from "@/lib/editor/builder-mode";

/* Exit preview — disables Draft Mode (and builder-canvas mode) for this
   browser and returns to the editor desk (or the public route).
   Deliberately ungated: clearing the bypass cookie is harmless and the
   banner's exit link must always work. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  (await draftMode()).disable();
  const url = new URL(req.url);
  const back = url.searchParams.get("back") ?? "";
  // only site-relative return targets — never an open redirect
  const target = back.startsWith("/") && !back.startsWith("//") ? `/admin/editor?route=${encodeURIComponent(back)}` : "/admin/editor";
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set(BUILDER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
