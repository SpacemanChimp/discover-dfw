import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { bySlug } from "@/lib/dfw-data";

/* Homepage-pick photo state for the Visual Builder's CHANGE PHOTO view —
   a READ over the EXISTING Photo Desk tables plus one convenience write:
   creating the homepage/pick photo_slots row for a city that never had one
   (same shape the seed script uses), so the EXISTING CI-7 upload pipeline
   has a slot to target. Nothing here approves, rejects, unpublishes, or
   replaces a photo — publishing an image stays the Photo Desk's explicit
   CI-6 APPROVE action, and the builder's publish gate refuses lineups
   whose cities lack an approved asset. */

export const dynamic = "force-dynamic";

const CITY_RE = /^[a-z0-9-]{2,60}$/;

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const city = url.searchParams.get("city") ?? "";
  if (!CITY_RE.test(city) || !bySlug[city]) {
    return NextResponse.json({ ok: false, error: "Unknown city" }, { status: 400 });
  }

  const { data: slot } = await ctx.db
    .from("photo_slots")
    .select("id, status, label, slot_key")
    .eq("entity_type", "homepage")
    .eq("entity_slug", city)
    .eq("slot_key", "pick")
    .maybeSingle();

  let asset: Record<string, unknown> | null = null;
  let pendingCandidates = 0;
  if (slot) {
    const [{ data: a }, { count }] = await Promise.all([
      ctx.db
        .from("photo_assets")
        .select("public_image_url, alt_text, caption, attribution_text, license, source_page_url, approved_by, approved_at, width, height")
        .eq("photo_slot_id", slot.id)
        .maybeSingle(),
      ctx.db
        .from("photo_candidates")
        .select("id", { count: "exact", head: true })
        .eq("photo_slot_id", slot.id)
        .in("status", ["pending", "needs_research"]),
    ]);
    // an asset is only ever the APPROVED image (photo_assets rows exist only
    // after CI-6 approval) — but belt+braces: require the slot to agree
    asset = a && slot.status === "approved" ? (a as Record<string, unknown>) : null;
    pendingCandidates = count ?? 0;
  }

  return NextResponse.json({
    ok: true,
    city,
    cityName: bySlug[city].name,
    slot: slot ? { id: slot.id, status: slot.status, label: slot.label } : null,
    asset,
    pendingCandidates,
  });
}

/** ensure-slot: give a lineup city its homepage/pick slot so the EXISTING
    manual-upload pipeline (and the Photo Desk queue) can work with it. */
export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ action?: string; city?: string }>(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "ensure-slot") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const city = String(body.city ?? "");
  const c = CITY_RE.test(city) ? bySlug[city] : undefined;
  if (!c) return NextResponse.json({ ok: false, error: "Unknown city" }, { status: 400 });

  const { data: existing } = await ctx.db
    .from("photo_slots")
    .select("id, status, label")
    .eq("entity_type", "homepage")
    .eq("entity_slug", city)
    .eq("slot_key", "pick")
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, slot: existing, created: false });

  // same row shape the seed script writes for homepage picks
  const { data: created, error } = await ctx.db
    .from("photo_slots")
    .insert({
      entity_type: "homepage",
      entity_slug: city,
      slot_key: "pick",
      label: `${c.name.toUpperCase()} — HOMEPAGE PICK`,
      label_source: "explicit",
      search_query: `${c.name} Texas downtown landmark`,
      preferred_orientation: "landscape",
      required_place_name: c.name,
      latitude: c.ll?.[1] ?? null,
      longitude: c.ll?.[0] ?? null,
      status: "missing",
    })
    .select("id, status, label")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await ctx.db.from("verification_events").insert({
    entity_type: "homepage",
    entity_slug: city,
    verified_by: ctx.admin.email,
    verification_method: "admin_review",
    action: "create",
    notes: "homepage pick photo slot created from the Visual Builder (upload target — publish still requires CI-6 approval)",
  });

  return NextResponse.json({ ok: true, slot: created, created: true });
}
