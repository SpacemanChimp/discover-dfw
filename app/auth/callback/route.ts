/* Magic-link / OAuth landing: exchange the auth code for a session cookie,
   then land on the shelf (or wherever `next` points). */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/db/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account/saved-homes";

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/homes?auth=failed`);
}
