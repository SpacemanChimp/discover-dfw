/* Session refresh middleware — keeps the Supabase auth cookie current on
   navigation. No route protection here: the product is guest-first, and
   account pages render guest/member variants themselves.

   One extra duty: any response rendered under Next.js Draft Mode (the
   admin editor's preview cookie) carries X-Robots-Tag noindex — a draft
   preview must never be indexable, whatever page it lands on. */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SESSION_PATHS = /^\/(account|homes$|city\/.+\/homes|listing\/|auth\/)/;

export async function middleware(request: NextRequest) {
  const hasDraftCookie = request.cookies.has("__prerender_bypass");

  // editorial routes are matched ONLY for the draft-preview noindex header —
  // they must never pay for a session refresh
  if (!SESSION_PATHS.test(request.nextUrl.pathname)) {
    const res = NextResponse.next();
    if (hasDraftCookie) res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // touching getUser() refreshes an expired token and rewrites the cookie
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // session routes + the editor-instrumented editorial routes (the latter
  // only matter when the draft-preview cookie is present — see above)
  matcher: [
    "/account/:path*",
    "/homes",
    "/city/:path*",
    "/listing/:path*",
    "/auth/:path*",
    "/",
    "/land",
    "/new-builds",
    "/how-we-research",
    // builder-created single-segment pages (draft-preview noindex header);
    // non-session paths short-circuit before any session work
    "/:slug",
  ],
};
