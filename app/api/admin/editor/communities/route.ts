import { NextResponse } from "next/server";
import { editorGate } from "@/lib/editor/api";
import { pageInventory } from "@/lib/content/community-content-drafts";
import { lintContentDraft, buildSeoCorpus, type ContentDraft, type LintResult } from "@/lib/content/community-content-drafts";
import { bySlug } from "@/lib/dfw-data";

/* Community Studio inventory — ONE read that unifies what already exists:
   the dataset's live pages (pageInventory), CB-1 community drafts, CB-3a
   content drafts, Photo Desk hero-slot state, page-specific layout
   overrides, and MLS-evidence presence. Pure aggregation: nothing here
   writes, publishes, or bypasses the CB-2 export lifecycle. */

export const dynamic = "force-dynamic";

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

  const [drafts, contentRows, slots, layoutDocs] = await Promise.all([
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
      .select("route, published_version_id")
      .like("route", "/city/%")
      .eq("region_key", "__layout"),
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
    items.push({
      key,
      citySlug: d.city_slug,
      cityName: bySlug[d.city_slug]?.name ?? d.city_slug,
      slug: d.slug,
      name: d.name,
      type: d.type as "hood" | "new_build",
      kind: "draft",
      lifecycle: d.lifecycle as StudioItem["lifecycle"],
      hasCustomContent: !!cd,
      contentLifecycle: (cd?.lifecycle as string) ?? null,
      contentLintErrors: lintErrors,
      heroApproved: !!slot?.approved,
      heroPending: slot?.pending ?? 0,
      mlsMatched: !!d.mls_snapshot_json,
      hasPageLayout: false,
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
      lint = lintContentDraft(shape, corpus, true); // export strictness
    }
    const factsRow = (drafts.data ?? []).find((d) => `${d.city_slug}/${d.slug}` === detail) ?? null;
    detailOut = { key: detail, lint, contentDraft: (cd as Record<string, unknown>) ?? null, facts: (factsRow as Record<string, unknown>) ?? null };
  }

  return NextResponse.json({ ok: true, items, detail: detailOut });
}
