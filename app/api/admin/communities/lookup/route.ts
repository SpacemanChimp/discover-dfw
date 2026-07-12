import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { lookupCommunity } from "@/lib/content/mls-community-lookup";

/* CB-1 MLS lookup. Admin-only, READ-ONLY: scans our replicated listings
   store for the entered name+city and returns counts, aliases, observed
   builders, a suggested price band, and cross-city homonym warnings.
   No external calls, no writes, no audit rows (reads aren't decisions). */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  let body: { name?: unknown; citySlug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  const result = await lookupCommunity(String(body.name ?? ""), String(body.citySlug ?? ""));
  if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, lookup: result });
}
