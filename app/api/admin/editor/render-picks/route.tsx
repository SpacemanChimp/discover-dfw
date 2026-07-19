import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { sanitizeLayout, editorsPicksFromLayout, TEMPLATE_SECTIONS, EDITORS_PICKS_DEFAULT } from "@/lib/editor/blocks.ts";
import { cities } from "@/lib/dfw-data";
import { getEditorState } from "@/lib/editor/overrides";
import { RichDoc } from "@/lib/editor/render";
import EditorsPicks from "@/components/EditorsPicks";

/* Render the REAL Editor's Picks section (photos, medians, attribution and
   all) for a working lineup, so card edits appear in the builder canvas
   immediately — the same admin-gated static-render pattern as render-block.
   The lineup goes through the SAME sanitizer as a save; the response also
   reports which cities lack an approved homepage-pick photo (the honest
   editor-facing state — publishing refuses until they all have one). */

export const dynamic = "force-dynamic";

interface Body {
  picks: unknown; // [{city, tagline?} ×4] or null for the code lineup
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const sections = TEMPLATE_SECTIONS["/"];
  let lineup: { city: string; tagline?: string }[] | null = null;
  if (body.picks !== null && body.picks !== undefined) {
    const s = sanitizeLayout(
      {
        type: "layout",
        blocks: [{ kind: "section", key: "picks", hidden: false, visibility: "all", settings: { picks: body.picks as { city: string }[] } }],
      },
      { pageKind: "template", sections, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, citySlugs: cities.map((c) => c.slug), fragment: true }
    );
    if (!s.ok || !s.doc) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    lineup = editorsPicksFromLayout(s.doc); // null = the identity lineup
  }

  // the intro region override (draft-aware — the admin request carries the
  // Draft Mode cookie) must survive a section re-render in the canvas
  const ed = await getEditorState("/");
  const intro = ed.regions["picks-intro"];

  try {
    const el = await EditorsPicks({
      lineup: lineup ?? undefined,
      bb: true,
      regionKey: "picks-intro",
      introOverride: intro ? <RichDoc doc={intro.json} /> : undefined,
    });
    const { renderToStaticMarkup } = (await import("react-dom/server")).default ?? (await import("react-dom/server"));
    const html = renderToStaticMarkup(el);

    // approved homepage-pick photo status per city (editor-facing honesty)
    const slugs = (lineup ?? EDITORS_PICKS_DEFAULT.map((c) => ({ city: c }))).map((p) => p.city);
    const { data } = await ctx.db
      .from("photo_slots")
      .select("entity_slug, photo_assets!inner(id)")
      .eq("entity_type", "homepage")
      .eq("slot_key", "pick")
      .eq("status", "approved")
      .in("entity_slug", slugs);
    const approved = new Set((data ?? []).map((r) => r.entity_slug as string));
    return NextResponse.json({ ok: true, html, picks: lineup, missingPhotos: slugs.filter((s2) => !approved.has(s2)) });
  } catch (e) {
    console.error("[render-picks]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Section render failed" }, { status: 500 });
  }
}
