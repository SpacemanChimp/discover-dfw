import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/db/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { SavedSearchFrequency } from "@/lib/mls/types";

/* Saved searches ("standing orders") for the signed-in user. Cookie-bound
   session + RLS — one user can never touch another's searches. Guests are
   gated in the UI and get 401 here. */

const FREQUENCIES: SavedSearchFrequency[] = ["instant", "daily", "weekly", "off"];

async function requireUser(): Promise<
  { supabase: SupabaseClient; user: User } | NextResponse
> {
  const supabase = await getSupabaseServer();
  if (!supabase)
    return NextResponse.json({ ok: false, error: "Accounts not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  return { supabase, user };
}

const toClient = (r: {
  id: string;
  name: string;
  filters: unknown;
  city_slug: string | null;
  query_label: string;
  query_string: string;
  frequency: string;
  email_enabled: boolean;
  created_at: string;
  updated_at: string | null;
  last_notified_at: string | null;
}) => ({
  id: r.id,
  name: r.name,
  filters: r.filters ?? undefined,
  citySlug: r.city_slug ?? undefined,
  queryLabel: r.query_label,
  queryString: r.query_string,
  frequency: (FREQUENCIES.includes(r.frequency as SavedSearchFrequency)
    ? r.frequency
    : "daily") as SavedSearchFrequency,
  emailEnabled: r.email_enabled,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined,
  lastNotifiedAt: r.last_notified_at ?? undefined,
});

const SELECT =
  "id, name, filters, city_slug, query_label, query_string, frequency, email_enabled, created_at, updated_at, last_notified_at";

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.supabase
    .from("saved_searches")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, searches: (data ?? []).map(toClient) });
}

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  let b: {
    id?: string;
    name?: string;
    filters?: Record<string, unknown>;
    citySlug?: string;
    queryLabel?: string;
    queryString?: string;
    frequency?: string;
    emailEnabled?: boolean;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!b.name?.trim())
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const row = {
    ...(b.id ? { id: b.id } : {}),
    user_id: user.id,
    name: b.name.trim().slice(0, 140),
    filters: b.filters ?? null,
    city_slug: b.citySlug ?? (b.filters?.citySlug as string | undefined) ?? null,
    query_label: (b.queryLabel ?? b.name).slice(0, 240),
    query_string: (b.queryString ?? "").slice(0, 500),
    frequency: FREQUENCIES.includes(b.frequency as SavedSearchFrequency) ? b.frequency : "daily",
    email_enabled: b.emailEnabled ?? true,
  };
  const { data, error } = await supabase.from("saved_searches").insert(row).select(SELECT).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, search: toClient(data) });
}

/** Update name / frequency / emailEnabled. Body: { id, ...patch } */
export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const { supabase } = ctx;

  let b: { id?: string; name?: string; frequency?: string; emailEnabled?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name?.trim()) patch.name = b.name.trim().slice(0, 140);
  if (b.frequency && FREQUENCIES.includes(b.frequency as SavedSearchFrequency))
    patch.frequency = b.frequency;
  if (typeof b.emailEnabled === "boolean") patch.email_enabled = b.emailEnabled;

  const { error } = await supabase.from("saved_searches").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/saved-searches?id=... */
export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await ctx.supabase.from("saved_searches").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
