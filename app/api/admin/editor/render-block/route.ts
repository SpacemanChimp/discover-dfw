import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { sanitizeLayout, TEMPLATE_SECTIONS, type LayoutEntry, type BlockInstance } from "@/lib/editor/blocks.ts";
import { resolvedBuilderBlock } from "@/lib/editor/blocks-render";
import { cities } from "@/lib/dfw-data";
import { sectionsForRoute } from "@/lib/editor/registry";

/* Render ONE builder block to real, static HTML for the admin canvas —
   the exact server component markup the public page would produce, so an
   inserted or edited block appears in the canvas with full fidelity
   without a page reload.

   Admin-gated like every editor route. The block goes through the SAME
   sanitizer as a save (per-block rules; whole-page rules are re-validated
   on every save/publish), so this endpoint can never render markup the
   store would refuse. The HTML travels only back to the admin shell, which
   forwards it into the same-origin canvas frame. */

export const dynamic = "force-dynamic";

interface Body {
  route: string;
  block: unknown;
  citySlug?: string;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<Body>(req);
  if (body instanceof NextResponse) return body;

  const route = String(body.route ?? "");
  const sections = sectionsForRoute(route);
  const pageKind: "custom" | "template" = sections ? "template" : "custom";

  const entry: LayoutEntry = { kind: "block", block: body.block as BlockInstance };
  const s = sanitizeLayout(
    { type: "layout", blocks: [entry] },
    {
      pageKind,
      sections,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      requireImageAlt: false,
      citySlugs: cities.map((c) => c.slug),
      fragment: true,
    }
  );
  if (!s.ok || !s.doc || s.doc.blocks[0]?.kind !== "block") {
    return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
  }
  const clean = s.doc.blocks[0].block;

  try {
    const el = await resolvedBuilderBlock(clean, body.citySlug ? String(body.citySlug) : undefined);
    // dynamic import: Next refuses a static react-dom/server import in app
    // modules; this admin-only endpoint renders one block to static HTML
    const { renderToStaticMarkup } = (await import("react-dom/server")).default ?? (await import("react-dom/server"));
    const html = renderToStaticMarkup(el);
    return NextResponse.json({ ok: true, html, block: clean });
  } catch (e) {
    // a block whose component can't static-render (browser-only code) is an
    // honest, non-fatal state — the canvas shows a placeholder and the real
    // component renders on the next full canvas load
    console.error("[render-block]", clean.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: true, html: null, unsupported: true, block: clean });
  }
}
