import { NextResponse } from "next/server";
import { getMlsProvider } from "@/lib/mls";
import type { Listing } from "@/lib/mls/types";

/* Shelf hydration: ?keys=k1,k2,… → the saved listings as the public Listing
   projection (never raw). Real NTREIS keys are numeric — mock ids and junk
   are dropped silently, capped at 60 keys per request. Private + no-store:
   the shelf must always reflect the feed as of right now. */

export const dynamic = "force-dynamic";

const MAX_KEYS = 60;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("keys") ?? "";
  const keys = [
    ...new Set(
      raw
        .split(",")
        .map((k) => k.trim())
        .filter((k) => /^\d+$/.test(k))
    ),
  ].slice(0, MAX_KEYS);

  if (keys.length === 0) {
    return NextResponse.json(
      { listings: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const provider = getMlsProvider();
    const resolved = await Promise.all(keys.map((k) => provider.getListingByKey(k)));
    const listings = resolved.filter((l): l is Listing => l !== null);
    return NextResponse.json(
      { listings },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("shelf-listings:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
