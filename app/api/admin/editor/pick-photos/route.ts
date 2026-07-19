import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { HOOD_GALLERY_SLOT_RE, HOOD_GALLERY_KEYS } from "@/lib/editor/blocks.ts";
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
  // homepage picks (default) or a community hero slot (entity=neighborhood,
  // key="city/slug" — works for live pages AND not-yet-exported drafts)
  const entity = url.searchParams.get("entity") === "neighborhood" ? "neighborhood" : "homepage";
  const rawKey = entity === "neighborhood" ? (url.searchParams.get("key") ?? "") : (url.searchParams.get("city") ?? "");
  const city = entity === "neighborhood" ? rawKey.split("/")[0] ?? "" : rawKey;
  const entityKey = entity === "neighborhood" ? rawKey : city;
  const slotKey = entity === "neighborhood" ? "hero" : "pick";
  if (!CITY_RE.test(city) || !bySlug[city] || (entity === "neighborhood" && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(rawKey))) {
    return NextResponse.json({ ok: false, error: "Unknown city" }, { status: 400 });
  }

  const { data: slot } = await ctx.db
    .from("photo_slots")
    .select("id, status, label, slot_key")
    .eq("entity_type", entity)
    .eq("entity_slug", entityKey)
    .eq("slot_key", slotKey)
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

  /* A3: community gallery slots — same deterministic seeder shapes
     (entity_type=neighborhood, slot_key=gallery-<i>). READ-ONLY here:
     approval/metadata stay Photo Desk actions. */
  let gallery: unknown[] | undefined;
  if (entity === "neighborhood") {
    const { data: gSlots } = await ctx.db
      .from("photo_slots")
      .select("id, status, label, slot_key")
      .eq("entity_type", "neighborhood")
      .eq("entity_slug", entityKey)
      .like("slot_key", "gallery-%");
    const rows = (gSlots ?? []).filter((s) => HOOD_GALLERY_SLOT_RE.test(s.slot_key));
    const ids = rows.map((s) => s.id);
    const [{ data: gAssets }, { data: gCands }] = ids.length
      ? await Promise.all([
          ctx.db
            .from("photo_assets")
            .select("photo_slot_id, public_image_url, alt_text, caption, attribution_text, license, source_page_url, approved_by, approved_at, width, height")
            .in("photo_slot_id", ids),
          ctx.db.from("photo_candidates").select("photo_slot_id").in("photo_slot_id", ids).in("status", ["pending", "needs_research"]),
        ])
      : [{ data: [] }, { data: [] }];
    const assetBySlot = new Map((gAssets ?? []).map((a) => [a.photo_slot_id as string, a]));
    const candCount = new Map<string, number>();
    for (const cRow of gCands ?? []) {
      const id = cRow.photo_slot_id as string;
      candCount.set(id, (candCount.get(id) ?? 0) + 1);
    }
    const bySlotKey = new Map(rows.map((s) => [s.slot_key as string, s]));
    gallery = HOOD_GALLERY_KEYS.map((k) => {
      const s = bySlotKey.get(k);
      return {
        slotKey: k,
        slot: s ? { id: s.id, status: s.status, label: s.label } : null,
        asset: s && s.status === "approved" ? (assetBySlot.get(s.id as string) ?? null) : null,
        pendingCandidates: s ? (candCount.get(s.id as string) ?? 0) : 0,
      };
    });
  }

  return NextResponse.json({
    ok: true,
    city: entityKey,
    cityName: bySlug[city].name,
    slot: slot ? { id: slot.id, status: slot.status, label: slot.label } : null,
    asset,
    pendingCandidates,
    ...(gallery ? { gallery } : {}),
  });
}

/** ensure-slot: give a lineup city its homepage/pick slot so the EXISTING
    manual-upload pipeline (and the Photo Desk queue) can work with it. */
export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ action?: string; city?: string; entity?: string; key?: string; name?: string; slotKey?: string }>(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "ensure-slot") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const entity = body.entity === "neighborhood" ? "neighborhood" : "homepage";
  const rawKey = entity === "neighborhood" ? String(body.key ?? "") : String(body.city ?? "");
  const citySlug = entity === "neighborhood" ? (rawKey.split("/")[0] ?? "") : rawKey;
  const c = CITY_RE.test(citySlug) ? bySlug[citySlug] : undefined;
  if (!c || (entity === "neighborhood" && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(rawKey))) {
    return NextResponse.json({ ok: false, error: "Unknown city" }, { status: 400 });
  }
  const entityKey = entity === "neighborhood" ? rawKey : citySlug;
  // deterministic slot keys, seeder-conventional: hero (default) or one of
  // the community gallery keys — never an ad hoc format
  const requestedSlot = String(body.slotKey ?? "");
  if (requestedSlot && !(entity === "neighborhood" && (requestedSlot === "hero" || HOOD_GALLERY_SLOT_RE.test(requestedSlot)))) {
    return NextResponse.json({ ok: false, error: "Unknown slot key" }, { status: 400 });
  }
  if (HOOD_GALLERY_SLOT_RE.test(requestedSlot) && !HOOD_GALLERY_KEYS.includes(requestedSlot)) {
    return NextResponse.json({ ok: false, error: `Gallery slots run gallery-0 … gallery-${HOOD_GALLERY_KEYS.length - 1}` }, { status: 400 });
  }
  const slotKey = entity === "neighborhood" ? (requestedSlot || "hero") : "pick";
  const displayName = entity === "neighborhood" ? String(body.name ?? rawKey.split("/")[1] ?? "").trim() || rawKey : c.name;
  const galleryIdx = slotKey.startsWith("gallery-") ? Number(slotKey.slice(8)) : null;

  const { data: existing } = await ctx.db
    .from("photo_slots")
    .select("id, status, label")
    .eq("entity_type", entity)
    .eq("entity_slug", entityKey)
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, slot: existing, created: false });

  // same row shapes the seed script writes
  const { data: created, error } = await ctx.db
    .from("photo_slots")
    .insert({
      entity_type: entity,
      entity_slug: entityKey,
      slot_key: slotKey,
      label:
        entity === "neighborhood"
          ? galleryIdx !== null
            ? `${displayName.toUpperCase()} — GALLERY ${galleryIdx + 1}`
            : `${displayName.toUpperCase()} — HERO`
          : `${c.name.toUpperCase()} — HOMEPAGE PICK`,
      label_source: "explicit",
      search_query:
        entity === "neighborhood"
          ? galleryIdx !== null
            ? `${displayName} ${c.name} Texas community streetscape`
            : `${displayName} ${c.name} Texas neighborhood`
          : `${c.name} Texas downtown landmark`,
      preferred_orientation: "landscape",
      required_place_name: entity === "neighborhood" ? `${displayName}, ${c.name}` : c.name,
      latitude: c.ll?.[1] ?? null,
      longitude: c.ll?.[0] ?? null,
      status: "missing",
    })
    .select("id, status, label")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await ctx.db.from("verification_events").insert({
    entity_type: entity,
    entity_slug: entityKey,
    verified_by: ctx.admin.email,
    verification_method: "admin_review",
    action: "create",
    notes:
      entity === "neighborhood"
        ? galleryIdx !== null
          ? `community gallery photo slot ${slotKey} created from the Community Studio (upload target — publish still requires CI-6 approval)`
          : "community hero photo slot created from the Community Studio (upload target — publish still requires CI-6 approval)"
        : "homepage pick photo slot created from the Visual Builder (upload target — publish still requires CI-6 approval)",
  });

  return NextResponse.json({ ok: true, slot: created, created: true });
}
