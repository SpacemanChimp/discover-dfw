/* Session refresh middleware — keeps the Supabase auth cookie current on
   navigation. No route protection here: the product is guest-first, and
   account pages render guest/member variants themselves. */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
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
  // only routes that read the session — skip static assets and editorial pages
  matcher: ["/account/:path*", "/homes", "/city/:path*/homes", "/listing/:path*", "/auth/:path*"],
};
