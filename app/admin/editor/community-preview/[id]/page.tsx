import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { bySlug, type NewBuild } from "@/lib/dfw-data";
import { contentFor, type HoodRef, type HoodContent } from "@/lib/hoods";
import { getDraftedRegions } from "@/lib/editor/overrides";
import { isBuilderMode } from "@/lib/editor/builder-mode";
import { HoodPageView } from "@/components/hood/HoodPageView";

/* Community Studio — PRIVATE draft preview. Renders a not-yet-exported
   community draft through the REAL hood/new-build page template
   (HoodPageView — the exact component the public route renders), using a
   synthesized HoodRef + the draft's CB-3a content merged over the same
   formula fallbacks the live pages use.

   Never public: admin allowlist gate (anonymous → 404), noindex/nofollow,
   force-dynamic, no route registration, no sitemap entry. Publishing
   remains the CB-2 export → review → merge → deploy lifecycle. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community draft preview",
  robots: { index: false, follow: false },
};

export default async function CommunityDraftPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bb?: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) notFound(); // anonymous and non-admin visitors see a plain 404

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getSupabaseAdmin();
  if (!db) notFound();

  const { data: d } = await db
    .from("community_drafts")
    .select("id, type, name, city_slug, slug, status_label, from_label, builders_count, builders_label, note, lifecycle")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();
  const c = bySlug[d.city_slug];
  if (!c) notFound();

  // synthesized identity — the SAME shapes the dataset would export
  const nb: NewBuild | undefined =
    d.type === "new_build"
      ? {
          name: d.name,
          city: d.city_slug,
          from: d.from_label ?? "$— (not set)",
          builders: d.builders_count ?? 0,
          status: d.status_label ?? "STATUS NOT SET",
          note: d.note ?? "",
        }
      : undefined;
  const h: HoodRef = {
    slug: d.slug,
    name: d.name,
    note: d.note?.trim() || `${d.name} in ${c.name}`,
    citySlug: d.city_slug,
    newBuild: nb,
  };

  // draft content (CB-3a row) merged over the formula fallbacks — exactly
  // the precedence an exported page would have
  const { data: cd } = await db
    .from("community_content_drafts")
    .select("seo_title, seo_description, tagline, intro_json, homes_copy, highlights_json, faq_json, newbuild_json")
    .eq("city_slug", d.city_slug)
    .eq("hood_slug", d.slug)
    .maybeSingle();
  const formula = contentFor(c, h);
  const introDraft = (cd?.intro_json as string[] | null) ?? [];
  const highlightsDraft = (cd?.highlights_json as { title: string; note: string }[] | null) ?? [];
  const faqDraft = (cd?.faq_json as { q: string; a: string }[] | null) ?? [];
  const content: HoodContent = {
    tagline: cd?.tagline?.trim() || formula.tagline,
    intro: introDraft.length ? introDraft : formula.intro,
    homes: cd?.homes_copy?.trim() || formula.homes,
    highlights: highlightsDraft.length ? highlightsDraft : formula.highlights,
    faq: faqDraft.length ? faqDraft : formula.faq,
    newBuild:
      d.type === "new_build"
        ? ((cd?.newbuild_json as { amenities: string[]; buyerNotes: string[] }) ?? formula.newBuild ?? { amenities: [], buyerNotes: [] })
        : undefined,
    seo: { title: cd?.seo_title ?? undefined, description: cd?.seo_description ?? undefined },
  };

  /* Amendment 1: the draft preview is a WORKSPACE, not a mock — it renders
     the saved layout/region documents keyed to the FUTURE canonical route
     (drafts only; nothing here is publishable until the page is exported,
     reviewed, and deployed). Inside the Visual Builder canvas (__bb cookie)
     the page mounts the same arrange/edit runtime a live page gets, and the
     sticky private-preview banner stays out of the canvas frame. */
  const regions = await getDraftedRegions(`/city/${d.city_slug}/${d.slug}`);
  // builder markup ONLY for the canvas: the preview API's redirect carries
  // bb=1 alongside the httpOnly __bb cookie — a plain preview (studio
  // iframe, OPEN IN TAB) has no param and keeps the banner even while the
  // cookie lingers from a canvas session
  const sp = await searchParams;
  const builder = sp.bb === "1" && (await isBuilderMode());

  if (builder) {
    return <HoodPageView c={c} h={h} draft={{ content, regions, builder: true }} />;
  }

  return (
    <div>
      <div
        className="font-mono"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5000,
          background: "#1D1913",
          borderBottom: "3px solid #D9481F",
          color: "#E88D6B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "9px 16px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".18em",
        }}
      >
        <span>
          🔒 PRIVATE DRAFT PREVIEW — {d.lifecycle.toUpperCase()} · /city/{d.city_slug}/{d.slug} DOES NOT EXIST PUBLICLY
        </span>
        <a href="/admin/editor" style={{ color: "#F6F1E6" }}>
          BACK TO STUDIO
        </a>
      </div>
      <HoodPageView c={c} h={h} draft={{ content, regions }} />
    </div>
  );
}
