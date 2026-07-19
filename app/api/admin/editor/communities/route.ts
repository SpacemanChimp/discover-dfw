import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { pageInventory } from "@/lib/content/community-content-drafts";
import { lintContentDraft, buildSeoCorpus, draftPageContext, type ContentDraft, type LintResult } from "@/lib/content/community-content-drafts";
import { sanitizeLayout, hoodGalleryFromLayout, TEMPLATE_SECTIONS, type LayoutDoc } from "@/lib/editor/blocks.ts";
import { validateClaims } from "@/lib/editor/doc";
import { pageByRoute } from "@/lib/editor/registry";
import { bySlug, cities } from "@/lib/dfw-data";

/* Community Studio inventory — ONE read that unifies what already exists:
   the dataset's live pages (pageInventory), CB-1 community drafts, CB-3a
   content drafts, Photo Desk hero-slot state, page-specific layout
   overrides, and MLS-evidence presence. Pure aggregation: nothing here
   writes, publishes, or bypasses the CB-2 export lifecycle.

   POST action "prepare" is Amendment 5's PREPARE FOR EXPORT gate: it runs
   the COMPLETE identity/facts/content/SEO/claims/photo/layout validation
   and either lists every blocker (with the tab that fixes it) or writes an
   audited verification stamp. It changes NOTHING else — the reviewed CB-2
   export → PR → deploy → --mark-live flow stays the only path to a public
   page, and this server never touches the repository. */

export const dynamic = "force-dynamic";

/** the marker the prepare stamp carries — the GET derives the PREPARED
    lifecycle state from the latest such event vs. every later edit */
const PREPARE_NOTES_PREFIX = "PREPARE FOR EXPORT";

interface StudioItem {
  key: string; // "city/slug"
  citySlug: string;
  cityName: string;
  slug: string;
  name: string;
  type: "hood" | "new_build";
  /** live-page = in the dataset today; draft = CB-1 workspace row */
  kind: "live-page" | "draft";
  lifecycle: "live" | "draft" | "ready" | "exported" | "archived";
  /** A5 derived: READY + a prepare stamp newer than every later edit */
  prepared: boolean;
  preparedAt: string | null;
  /** A5 derived: EXPORTED and the route exists in THIS deployed build */
  deployed: boolean;
  hasCustomContent: boolean;
  contentLifecycle: string | null;
  contentLintErrors: number;
  heroApproved: boolean;
  heroPending: number;
  mlsMatched: boolean;
  hasPageLayout: boolean;
  draftId: string | null;
  contentDraftId: string | null;
  warnings: string[];
}

export async function GET(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;
  const url = new URL(req.url);
  const detail = url.searchParams.get("detail"); // "city/slug" → include lint detail

  const [drafts, contentRows, slots, layoutDocs, prepareEvents] = await Promise.all([
    ctx.db
      .from("community_drafts")
      .select("id, type, name, city_slug, slug, status_label, from_label, builders_count, builders_label, note, lifecycle, ready_for_export, mls_snapshot_json, updated_at")
      .order("updated_at", { ascending: false }),
    ctx.db
      .from("community_content_drafts")
      .select("id, city_slug, hood_slug, seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json, links_json, lint_json, ready_for_export, lifecycle, mls_snapshot_json, updated_at"),
    ctx.db
      .from("photo_slots")
      .select("entity_slug, status, photo_candidates(count)")
      .eq("entity_type", "neighborhood")
      .eq("slot_key", "hero"),
    ctx.db
      .from("editor_documents")
      .select("route, published_version_id, draft:editor_versions!editor_documents_draft_fk(created_at)")
      .like("route", "/city/%")
      .eq("region_key", "__layout"),
    ctx.db
      .from("verification_events")
      .select("entity_slug, created_at")
      .eq("entity_type", "community_draft")
      .eq("action", "verify")
      .like("notes", `${PREPARE_NOTES_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const contentByKey = new Map((contentRows.data ?? []).map((r) => [`${r.city_slug}/${r.hood_slug}`, r]));
  const slotByKey = new Map(
    (slots.data ?? []).map((r) => {
      const pending = Array.isArray(r.photo_candidates) ? ((r.photo_candidates[0] as { count?: number })?.count ?? 0) : 0;
      return [r.entity_slug as string, { approved: r.status === "approved", pending }];
    })
  );
  const layoutByRoute = new Set(
    (layoutDocs.data ?? []).filter((d) => d.published_version_id).map((d) => d.route as string)
  );
  const layoutDraftAtByRoute = new Map(
    (layoutDocs.data ?? []).map((d) => {
      const draft = Array.isArray(d.draft) ? d.draft[0] : d.draft;
      return [d.route as string, (draft as { created_at?: string } | null)?.created_at ?? null];
    })
  );
  // latest prepare stamp per community (rows arrive newest-first)
  const preparedAtByKey = new Map<string, string>();
  for (const ev of prepareEvents.data ?? []) {
    if (!preparedAtByKey.has(ev.entity_slug as string)) preparedAtByKey.set(ev.entity_slug as string, ev.created_at as string);
  }

  const items: StudioItem[] = [];

  // live dataset pages
  for (const p of pageInventory()) {
    const key = `${p.citySlug}/${p.hoodSlug}`;
    const cd = contentByKey.get(key);
    const slot = slotByKey.get(key);
    const lintErrors = ((cd?.lint_json as LintResult | null)?.errors ?? []).length;
    const warnings: string[] = [];
    if (!slot?.approved) warnings.push("no approved hero photo");
    if (cd && lintErrors > 0) warnings.push(`${lintErrors} content lint error${lintErrors === 1 ? "" : "s"}`);
    items.push({
      key,
      citySlug: p.citySlug,
      cityName: p.cityName,
      slug: p.hoodSlug,
      name: p.hoodName,
      type: p.isNewBuild ? "new_build" : "hood",
      kind: "live-page",
      lifecycle: "live",
      prepared: false,
      preparedAt: null,
      deployed: true,
      hasCustomContent: p.hasCustomContent || !!cd,
      contentLifecycle: (cd?.lifecycle as string) ?? null,
      contentLintErrors: lintErrors,
      heroApproved: !!slot?.approved,
      heroPending: slot?.pending ?? 0,
      mlsMatched: !!cd?.mls_snapshot_json,
      hasPageLayout: layoutByRoute.has(`/city/${key}`),
      draftId: null,
      contentDraftId: (cd?.id as string) ?? null,
      warnings,
    });
  }

  // CB-1 drafts (the ones NOT yet in the dataset; live-stamped rows already
  // appear above via pageInventory, so only surface pre-live + archived)
  const liveKeys = new Set(items.map((i) => i.key));
  for (const d of drafts.data ?? []) {
    const key = `${d.city_slug}/${d.slug}`;
    if (d.lifecycle === "live" && liveKeys.has(key)) continue;
    const cd = contentByKey.get(key);
    const slot = slotByKey.get(key);
    const lintErrors = ((cd?.lint_json as LintResult | null)?.errors ?? []).length;
    const warnings: string[] = [];
    if (d.lifecycle === "draft" || d.lifecycle === "ready") {
      if (!cd) warnings.push("no page content drafted yet");
      else if (lintErrors > 0) warnings.push(`${lintErrors} content lint error${lintErrors === 1 ? "" : "s"}`);
      if (!slot?.approved) warnings.push("no approved hero photo");
      if (d.type === "new_build" && !d.status_label) warnings.push("community status not set");
      if (d.type === "new_build" && d.builders_count == null && !d.builders_label) warnings.push("builder claim unverified");
      if (!d.mls_snapshot_json) warnings.push("MLS lookup not run");
    }
    /* A5 derived states — honest by construction:
       PREPARED only while the audited stamp is newer than every later edit
       (facts, content, or canvas layout); DEPLOYED only when THIS deployed
       build actually serves the route. */
    const stamp = preparedAtByKey.get(key) ?? null;
    const layoutDraftAt = layoutDraftAtByRoute.get(`/city/${key}`) ?? null;
    const stampFresh =
      !!stamp &&
      stamp >= String(d.updated_at ?? "") &&
      (!cd || stamp >= String(cd.updated_at ?? "")) &&
      (!layoutDraftAt || stamp >= layoutDraftAt);
    items.push({
      key,
      citySlug: d.city_slug,
      cityName: bySlug[d.city_slug]?.name ?? d.city_slug,
      slug: d.slug,
      name: d.name,
      type: d.type as "hood" | "new_build",
      kind: "draft",
      lifecycle: d.lifecycle as StudioItem["lifecycle"],
      prepared: d.lifecycle === "ready" && stampFresh,
      preparedAt: stampFresh ? stamp : null,
      deployed: d.lifecycle === "exported" && !!pageByRoute(`/city/${key}`),
      hasCustomContent: !!cd,
      contentLifecycle: (cd?.lifecycle as string) ?? null,
      contentLintErrors: lintErrors,
      heroApproved: !!slot?.approved,
      heroPending: slot?.pending ?? 0,
      mlsMatched: !!d.mls_snapshot_json,
      hasPageLayout: layoutByRoute.has(`/city/${key}`) || !!layoutDraftAt,
      draftId: d.id as string,
      contentDraftId: (cd?.id as string) ?? null,
      warnings,
    });
  }

  /* optional readiness detail: a fresh server-side lint for one community —
     the same lintContentDraft the Content Desk and exporter use */
  let detailOut: { key: string; lint: LintResult | null; contentDraft: Record<string, unknown> | null; facts: Record<string, unknown> | null } | null = null;
  if (detail && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(detail)) {
    const [citySlug, hoodSlug] = detail.split("/");
    const cd = contentByKey.get(detail);
    let lint: LintResult | null = null;
    if (cd) {
      const shape: ContentDraft = {
        id: cd.id as string,
        citySlug,
        hoodSlug,
        seoTitle: (cd.seo_title as string) ?? null,
        seoDescription: (cd.seo_description as string) ?? null,
        tagline: (cd.tagline as string) ?? null,
        intro: (cd.intro_json as string[]) ?? [],
        homesCopy: (cd.homes_copy as string) ?? null,
        highlights: (cd.highlights_json as { title: string; note: string }[]) ?? [],
        faq: (cd.faq_json as { q: string; a: string }[]) ?? [],
        newBuild: (cd.newbuild_json as { amenities: string[]; buyerNotes: string[] }) ?? null,
        links: (cd.links_json as { label: string; href: string }[]) ?? [],
        mlsSnapshot: (cd.mls_snapshot_json as Record<string, unknown>) ?? null,
        lint: null,
        readyForExport: !!cd.ready_for_export,
        lifecycle: cd.lifecycle as ContentDraft["lifecycle"],
        createdBy: "",
        updatedAt: String(cd.updated_at ?? ""),
      };
      const corpus = buildSeoCorpus(
        (contentRows.data ?? [])
          .filter((r) => `${r.city_slug}/${r.hood_slug}` !== detail)
          .map((r) => ({ citySlug: r.city_slug, hoodSlug: r.hood_slug, seoTitle: r.seo_title, seoDescription: r.seo_description }))
      );
      // a not-yet-exported draft lints against its synthesized page context
      const dRow = (drafts.data ?? []).find((x) => `${x.city_slug}/${x.slug}` === detail && x.lifecycle !== "archived") ?? null;
      lint = lintContentDraft(shape, corpus, true, dRow ? draftPageContext(dRow) : null); // export strictness
    }
    const factsRow = (drafts.data ?? []).find((d) => `${d.city_slug}/${d.slug}` === detail) ?? null;
    detailOut = { key: detail, lint, contentDraft: (cd as Record<string, unknown>) ?? null, facts: (factsRow as Record<string, unknown>) ?? null };
  }

  return NextResponse.json({ ok: true, items, detail: detailOut });
}

/* ---------------------- A5: PREPARE FOR EXPORT ------------------------- */

interface PrepareBlocker {
  tab: string;
  message: string;
}

export async function POST(req: Request) {
  const ctx = await editorGate(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await readJsonBody<{ action?: string; key?: string }>(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "prepare") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  const key = String(body.key ?? "");
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) return NextResponse.json({ ok: false, error: "Bad key" }, { status: 400 });
  const [citySlug, hoodSlug] = key.split("/");

  const { data: d } = await ctx.db
    .from("community_drafts")
    .select("id, type, name, city_slug, slug, status_label, from_label, builders_count, builders_label, note, lifecycle, mls_snapshot_json")
    .eq("city_slug", citySlug)
    .eq("slug", hoodSlug)
    .neq("lifecycle", "archived")
    .maybeSingle();
  if (!d) return NextResponse.json({ ok: false, error: "No active community draft for that key" }, { status: 404 });

  const blockers: PrepareBlocker[] = [];

  /* identity */
  if (!bySlug[citySlug]) blockers.push({ tab: "identity", message: "City is not a canonical DFW city" });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) blockers.push({ tab: "identity", message: `Slug "${d.slug}" is not canonical (lowercase, single hyphens)` });
  if (!String(d.name ?? "").trim()) blockers.push({ tab: "identity", message: "The community needs a name" });

  /* lifecycle position */
  if (d.lifecycle !== "ready") {
    blockers.push({ tab: "preview", message: "The community is not marked READY — pass the readiness gates and MARK READY first" });
  }

  /* facts + MLS evidence */
  if (d.type === "new_build") {
    if (!String(d.status_label ?? "").trim()) blockers.push({ tab: "facts", message: "Sales status not set — the hero would render STATUS NOT SET" });
    if (!String(d.from_label ?? "").trim()) blockers.push({ tab: "facts", message: "Pricing FROM label not set — the hero would render $— (not set)" });
    if (d.builders_count == null && !String(d.builders_label ?? "").trim()) {
      blockers.push({ tab: "facts", message: "Builder claim unverified — set a verified count or a generic label" });
    }
  }
  if (!d.mls_snapshot_json) blockers.push({ tab: "facts", message: "MLS lookup evidence not frozen on the draft" });

  /* content + SEO + claims — the exporter's own strict lint */
  const { data: allContent } = await ctx.db
    .from("community_content_drafts")
    .select("id, city_slug, hood_slug, seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json, links_json, mls_snapshot_json, ready_for_export, lifecycle, updated_at");
  const cd = (allContent ?? []).find((r) => `${r.city_slug}/${r.hood_slug}` === key) ?? null;
  if (!cd) {
    blockers.push({ tab: "content", message: "No page content drafted" });
  } else {
    if (!cd.ready_for_export) blockers.push({ tab: "content", message: "Content is not marked READY (server lint sign-off)" });
    const shape: ContentDraft = {
      id: cd.id as string,
      citySlug,
      hoodSlug,
      seoTitle: (cd.seo_title as string) ?? null,
      seoDescription: (cd.seo_description as string) ?? null,
      tagline: (cd.tagline as string) ?? null,
      intro: (cd.intro_json as string[]) ?? [],
      homesCopy: (cd.homes_copy as string) ?? null,
      highlights: (cd.highlights_json as { title: string; note: string }[]) ?? [],
      faq: (cd.faq_json as { q: string; a: string }[]) ?? [],
      newBuild: (cd.newbuild_json as { amenities: string[]; buyerNotes: string[] }) ?? null,
      links: (cd.links_json as { label: string; href: string }[]) ?? [],
      mlsSnapshot: (cd.mls_snapshot_json as Record<string, unknown>) ?? null,
      lint: null,
      readyForExport: !!cd.ready_for_export,
      lifecycle: cd.lifecycle as ContentDraft["lifecycle"],
      createdBy: "",
      updatedAt: String(cd.updated_at ?? ""),
    };
    const corpus = buildSeoCorpus(
      (allContent ?? [])
        .filter((r) => `${r.city_slug}/${r.hood_slug}` !== key)
        .map((r) => ({ citySlug: r.city_slug, hoodSlug: r.hood_slug, seoTitle: r.seo_title, seoDescription: r.seo_description }))
    );
    const lint = lintContentDraft(shape, corpus, true, draftPageContext(d));
    for (const e of lint.errors) blockers.push({ tab: "content", message: `${e.field}: ${e.message}` });
  }

  /* photos */
  const { data: heroSlot } = await ctx.db
    .from("photo_slots")
    .select("status")
    .eq("entity_type", "neighborhood")
    .eq("entity_slug", key)
    .eq("slot_key", "hero")
    .maybeSingle();
  if (heroSlot?.status !== "approved") blockers.push({ tab: "photos", message: "No approved hero photo (Photo Desk CI-6 approval required)" });

  /* layout + canvas text drafts on the FUTURE route — publish-grade checks */
  const route = `/city/${key}`;
  const { data: routeDocs } = await ctx.db
    .from("editor_documents")
    .select("region_key, draft:editor_versions!editor_documents_draft_fk(content_type, content_json, content_text)")
    .eq("route", route);
  for (const docRow of routeDocs ?? []) {
    const draft = (Array.isArray(docRow.draft) ? docRow.draft[0] : docRow.draft) as { content_type: string; content_json: unknown; content_text: string | null } | null;
    if (!draft) continue;
    if (docRow.region_key === "__layout") {
      const s = sanitizeLayout(draft.content_json, {
        pageKind: "template",
        sections: TEMPLATE_SECTIONS["template:hood"],
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        requireImageAlt: true,
        citySlugs: cities.map((c) => c.slug),
      });
      for (const e of s.errors) blockers.push({ tab: "arrange", message: `layout: ${e}` });
      for (const e of validateClaims(s.ok ? s.text : String(draft.content_text ?? ""))) blockers.push({ tab: "arrange", message: `layout: ${e}` });
      const galleryOrder = s.ok && s.doc ? hoodGalleryFromLayout(s.doc as LayoutDoc) : null;
      if (galleryOrder) {
        const { data: gSlots } = await ctx.db
          .from("photo_slots")
          .select("slot_key")
          .eq("entity_type", "neighborhood")
          .eq("entity_slug", key)
          .eq("status", "approved")
          .in("slot_key", galleryOrder);
        const approved = new Set((gSlots ?? []).map((r) => r.slot_key as string));
        for (const k of galleryOrder) {
          if (!approved.has(k)) blockers.push({ tab: "photos", message: `gallery entry "${k}" has no APPROVED photo — approve it or remove it from the order` });
        }
      }
    } else {
      // canvas text/tagline drafts: the claims linter is the publication risk
      for (const e of validateClaims(String(draft.content_text ?? ""))) {
        blockers.push({ tab: "arrange", message: `“${docRow.region_key}” canvas draft: ${e}` });
      }
    }
  }

  if (blockers.length > 0) {
    return NextResponse.json({ ok: true, prepared: false, blockers });
  }

  /* everything clean → audited stamp; the GET derives PREPARED from it and
     any later edit makes it stale automatically. NOTHING is exported,
     published, or written to the repository here. */
  const { error: evErr } = await ctx.db.from("verification_events").insert({
    entity_type: "community_draft",
    entity_slug: key,
    verified_by: ctx.admin.email,
    verification_method: "admin_review",
    action: "verify",
    notes: `${PREPARE_NOTES_PREFIX} — identity, facts, content, SEO, claims, photo, and layout validation passed; the page ships only via the reviewed CB-2 export → PR → deploy → --mark-live flow`,
  });
  if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, prepared: true });
}
