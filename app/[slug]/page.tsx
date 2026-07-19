import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import PreviewBanner from "@/components/editor/PreviewBanner";
import { isBuilderMode } from "@/lib/editor/builder-mode";
import { getEditorPage, getPageLayout } from "@/lib/editor/pages";
import { applyLayout, layoutFaqItems } from "@/lib/editor/blocks-render";
import { RESERVED_SLUGS } from "@/lib/editor/blocks.ts";
import { SITE_URL, SITE_NAME } from "@/lib/site";

/* Admin-created builder pages (/{slug}). Static code routes always win this
   dynamic segment; RESERVED_SLUGS is a second guard. Contract:
     draft      → 404 for anonymous visitors, renders ONLY inside the
                  admin-authenticated Draft Mode preview (noindex via
                  middleware + robots below)
     published  → public, indexable, in the sitemap, canonical /{slug}
   A database failure yields a plain 404 — nothing that exists in code is
   affected by this route. */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) return {};
  const page = await getEditorPage(slug);
  if (!page) return {};
  const published = page.status === "published";
  return {
    title: { absolute: page.seo_title || `${page.title} | ${SITE_NAME}` },
    description: page.seo_description || undefined,
    alternates: { canonical: `/${page.slug}` }, // generated, read-only
    robots: published ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: page.seo_title || page.title,
      description: page.seo_description || undefined,
      url: `/${page.slug}`,
      siteName: SITE_NAME,
      type: "website",
      ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
    },
  };
}

export default async function BuilderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();

  const page = await getEditorPage(slug);
  if (!page) notFound();

  let preview = false;
  try {
    preview = (await draftMode()).isEnabled;
  } catch {
    preview = false;
  }
  // drafts exist ONLY for the authenticated preview session
  if (page.status !== "published" && !preview) notFound();

  const builder = preview && (await isBuilderMode());
  const layout = await getPageLayout(slug, preview);
  if (!layout) notFound();

  const faqs = layoutFaqItems(layout);
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: page.title, item: `${SITE_URL}/${page.slug}` },
      ],
    },
  ];
  if (faqs.length && page.status === "published") {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      // derived from the SAME published layout the visible blocks render
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }

  return (
    <div style={{ background: "#F6F1E6", color: "#1D1913", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {preview && !builder && <PreviewBanner route={`/${slug}`} />}
      {page.header_footer && <Nav />}
      <main>{applyLayout(layout, [], {}, undefined, builder)}</main>
      {page.header_footer && <Footer />}
    </div>
  );
}
