import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/db/server";

/* Adopts legacy guest-saved searches on first sign-in (guests are gated
   from creating new ones, but pre-gate localStorage data still merges). */
export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  if (!supabase)
    return NextResponse.json({ ok: false, error: "Accounts not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });

  let body: {
    searches?: {
      name?: string;
      filters?: Record<string, unknown>;
      citySlug?: string;
      queryLabel?: string;
      queryString?: string;
      frequency?: string;
      createdAt?: string;
    }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const legacyFreq: Record<string, string> = {
    Instant: "instant",
    "Daily digest": "daily",
    "Weekly letter": "weekly",
  };
  const rows = (body.searches ?? [])
    .filter((s) => s?.name)
    .slice(0, 100)
    .map((s) => ({
      user_id: user.id,
      name: s.name!.slice(0, 140),
      filters: s.filters ?? null,
      city_slug: s.citySlug ?? (s.filters?.citySlug as string | undefined) ?? null,
      query_label: (s.queryLabel ?? s.name!).slice(0, 240),
      query_string: (s.queryString ?? "").slice(0, 500),
      frequency: legacyFreq[s.frequency ?? ""] ?? (["instant", "daily", "weekly", "off"].includes(s.frequency ?? "") ? s.frequency : "daily"),
      email_enabled: true,
      created_at: s.createdAt ?? new Date().toISOString(),
    }));
  if (!rows.length) return NextResponse.json({ ok: true, merged: 0 });

  const { error } = await supabase.from("saved_searches").insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, merged: rows.length });
}
