import { NextResponse } from "next/server";
import { editorGate, readJsonBody } from "@/lib/editor/api";
import { pageInventory } from "@/lib/content/community-content-drafts";
import { lintContentDraft, buildSeoCorpus, draftPageContext, type ContentDraft, type LintResult } from "@/lib/content/community-content-drafts";
import { prepareBlockers, preparedStampFresh, type PrepareBlocker } from "@/lib/editor/prepare";
import { pageByRoute } from "@/lib/editor/registry";
import { cities } from "@/lib/dfw-data";
import { bySlug } from "@/lib/dfw-data";

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
    const stampFresh = preparedStampFresh(stamp, [String(d.updated_at ?? ""), cd ? String(cd.updated_at ?? "") : null, layoutDraftAt]);
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

  /* content + SEO + claims — the exporter's own strict lint */
  const { data: allContent } = await ctx.db
    .from("community_content_drafts")
    .select("id, city_slug, hood_slug, seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json, links_json, mls_snapshot_json, ready_for_export, lifecycle, updated_at");
  const cd = (allContent ?? []).find((r) => `${r.city_slug}/${r.hood_slug}` === key) ?? null;
  let contentLintErrors: { field: string; message: string }[] = [];
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
      (allContent ?? [])
        .filter((r) => `${r.city_slug}/${r.hood_slug}` !== key)
        .map((r) => ({ citySlug: r.city_slug, hoodSlug: r.hood_slug, seoTitle: r.seo_title, seoDescription: r.seo_description }))
    );
    const lint = lintContentDraft(shape, corpus, true, draftPageContext(d));
    contentLintErrors = lint.errors.map((e) => ({ field: e.field, message: e.message }));
  }

  /* photos: hero approval + every APPROVED gallery slot for this entity */
  const { data: photoRows } = await ctx.db
    .from("photo_slots")
    .select("slot_key, status")
    .eq("entity_type", "neighborhood")
    .eq("entity_slug", key);
  const heroApproved = (photoRows ?? []).some((r) => r.slot_key === "hero" && r.status === "approved");
  const approvedGallerySlots = new Set((photoRows ?? []).filter((r) => r.status === "approved" && r.slot_key.startsWith("gallery-")).map((r) => r.slot_key as string));

  /* route-keyed editor DRAFT documents (__layout + canvas text regions) */
  const route = `/city/${key}`;
  const { data: routeDocs } = await ctx.db
    .from("editor_documents")
    .select("region_key, draft:editor_versions!editor_documents_draft_fk(content_type, content_json, content_text)")
    .eq("route", route);
  const routeDrafts = (routeDocs ?? []).flatMap((docRow) => {
    const draft = (Array.isArray(docRow.draft) ? docRow.draft[0] : docRow.draft) as { content_json: unknown; content_text: string | null } | null;
    return draft ? [{ regionKey: docRow.region_key as string, contentJson: draft.content_json, contentText: draft.content_text }] : [];
  });

  /* the COMPLETE validator is pure and fixture-tested — the route only
     gathers rows (scripts/tests/prepare-community.test.mjs) */
  const blockers: PrepareBlocker[] = prepareBlockers({
    draft: {
      type: d.type as "hood" | "new_build",
      name: d.name,
      slug: d.slug,
      lifecycle: d.lifecycle,
      statusLabel: d.status_label,
      fromLabel: d.from_label,
      buildersCount: d.builders_count,
      buildersLabel: d.builders_label,
      hasMlsSnapshot: !!d.mls_snapshot_json,
    },
    cityCanonical: !!bySlug[citySlug],
    content: { exists: !!cd, ready: !!cd?.ready_for_export, lintErrors: contentLintErrors },
    heroApproved,
    routeDrafts,
    approvedGallerySlots,
    citySlugs: cities.map((c) => c.slug),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

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
