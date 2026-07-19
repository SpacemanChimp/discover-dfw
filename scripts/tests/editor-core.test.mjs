/* EDITOR desk core contract tests — sanitation, validation, and region
   resolution (lib/editor/doc.ts is pure; node --test runs it directly).
     node --test scripts/tests/editor-core.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeRichDoc,
  sanitizeTextValue,
  sanitizeFaq,
  sanitizeContent,
  validateSeo,
  validateClaims,
  isAllowedLinkHref,
  isAllowedImageSrc,
  resolveRegions,
  SEO_TITLE_MAX,
  SEO_DESC_MAX,
} from "../../lib/editor/doc.ts";

const SUPA = "https://example.supabase.co";
const OPTS = { allowImages: true, supabaseUrl: SUPA, requireImageAlt: true };

const p = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content) => ({ type: "doc", content });

test("sanitize keeps allowed structure and extracts plain text", () => {
  const r = sanitizeRichDoc(
    doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Water" }] },
      p("City tap or a drilled well."),
      { type: "bulletList", content: [{ type: "listItem", content: [p("Check the co-op")] }] }
    ),
    OPTS
  );
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.doc.content.length, 3);
  assert.ok(r.text.includes("Water"));
  assert.ok(r.text.includes("co-op"));
});

test("disallowed HTML/script shapes are refused, never passed through", () => {
  // unknown block
  const r1 = sanitizeRichDoc(doc({ type: "iframe", attrs: { src: "https://x.test" } }), OPTS);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => e.includes("iframe")));
  // script-shaped payload text
  const r2 = sanitizeRichDoc(doc(p("<script>alert(1)</script>")), OPTS);
  assert.equal(r2.ok, false);
  // raw string instead of structured JSON
  const r3 = sanitizeRichDoc("<b>html</b>", OPTS);
  assert.equal(r3.ok, false);
  // event-handler-shaped attr content
  const r4 = sanitizeRichDoc(doc(p('x" onerror=alert(1)')), OPTS);
  assert.equal(r4.ok, false);
});

test("link protocols: https/http/relative allowed; javascript/data/protocol-relative refused", () => {
  assert.equal(isAllowedLinkHref("https://discoverdfw.com/land"), true);
  assert.equal(isAllowedLinkHref("/city/frisco"), true);
  assert.equal(isAllowedLinkHref("#cities"), true);
  assert.equal(isAllowedLinkHref("javascript:alert(1)"), false);
  assert.equal(isAllowedLinkHref("data:text/html;base64,xx"), false);
  assert.equal(isAllowedLinkHref("//evil.test/x"), false);
  assert.equal(isAllowedLinkHref("vbscript:x"), false);

  const bad = sanitizeRichDoc(
    doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }),
    OPTS
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /unsupported protocol/.test(e)));
});

test("H1 is refused inside rich content; H4+ refused; H2/H3 allowed", () => {
  const h1 = sanitizeRichDoc(doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "No" }] }), OPTS);
  assert.equal(h1.ok, false);
  assert.ok(h1.errors.some((e) => /H1 is not allowed/.test(e)));
  const h4 = sanitizeRichDoc(doc({ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "No" }] }), OPTS);
  assert.equal(h4.ok, false);
  const ok = sanitizeRichDoc(doc({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Yes" }] }, p("body")), OPTS);
  assert.equal(ok.ok, true);
});

test("images: bucket/relative srcs only, hotlinks refused, alt required at publish", () => {
  const bucketSrc = `${SUPA}/storage/v1/object/public/editorial-photos/editor/2026/x.jpg`;
  assert.equal(isAllowedImageSrc(bucketSrc, SUPA), true);
  assert.equal(isAllowedImageSrc("/images/local.jpg", SUPA), true);
  assert.equal(isAllowedImageSrc("https://images.unsplash.com/x.jpg", SUPA), false);

  const hotlink = sanitizeRichDoc(doc({ type: "image", attrs: { src: "https://hotlink.test/a.jpg", alt: "x" } }, p("t")), OPTS);
  assert.equal(hotlink.ok, false);

  const noAlt = sanitizeRichDoc(doc({ type: "image", attrs: { src: bucketSrc, alt: "" } }, p("t")), OPTS);
  assert.equal(noAlt.ok, false);
  assert.ok(noAlt.errors.some((e) => /alt text/.test(e)));

  // drafts may hold an image without alt (publication is the gate)
  const draftOk = sanitizeRichDoc(doc({ type: "image", attrs: { src: bucketSrc, alt: "" } }, p("t")), { ...OPTS, requireImageAlt: false });
  assert.equal(draftOk.ok, true);

  // images refused entirely where the region disallows them
  const noImgRegion = sanitizeRichDoc(doc({ type: "image", attrs: { src: bucketSrc, alt: "x" } }, p("t")), { ...OPTS, allowImages: false });
  assert.equal(noImgRegion.ok, false);
});

test("SEO limits + exact-duplicate detection", () => {
  const existing = { titles: ["Frisco, TX — Neighborhoods, Homes & Living Guide"], descriptions: ["Existing description of fifty-plus characters for the duplicate check here."] };
  assert.deepEqual(validateSeo("A good length SEO title for a city page", "A description long enough to satisfy the fifty-character minimum comfortably.", existing), []);
  assert.ok(validateSeo("Too short", null, existing).some((e) => /dangerously short/.test(e)));
  assert.ok(validateSeo("x".repeat(SEO_TITLE_MAX + 1), null, existing).some((e) => /too long/.test(e)));
  assert.ok(validateSeo(null, "short desc", existing).some((e) => /too short/.test(e)));
  assert.ok(validateSeo(null, "y".repeat(SEO_DESC_MAX + 1), existing).some((e) => /too long/.test(e)));
  assert.ok(validateSeo("frisco, tx — neighborhoods, homes & living guide", null, existing).some((e) => /duplicates/.test(e)));
});

test("risky-claim linter blocks guarantees, school assignment, incentives, final phase, placeholders, stuffing", () => {
  assert.ok(validateClaims("We guarantee the best resale value.").length > 0);
  assert.ok(validateClaims("Your kids are zoned to Guyer High.").length > 0);
  assert.ok(validateClaims("This is the final phase — act now!").length > 0);
  assert.ok(validateClaims("Get $25,000 off this month.").length > 0);
  assert.ok(validateClaims("A 4.99% rate buydown is available.").length > 0);
  assert.ok(validateClaims("TBD — write this section later").length > 0);
  const stuffed = ("frisco homes frisco homes frisco homes frisco homes frisco homes " ).repeat(5);
  assert.ok(validateClaims(stuffed).some((e) => /keyword stuffing/.test(e)));
  assert.equal(validateClaims("A calm paragraph about porches, parks, and commutes in North Texas.").length, 0);
});

test("text + faq content types validate shape and reject markup", () => {
  assert.equal(sanitizeTextValue({ value: "A tidy tagline." }).ok, true);
  assert.equal(sanitizeTextValue({ value: "<b>html</b>" }).ok, false);
  assert.equal(sanitizeTextValue({}).ok, false);

  const faq = sanitizeFaq({ items: [{ q: "Is there an HOA?", a: "Yes — confirm dues with the association." }] });
  assert.equal(faq.ok, true);
  assert.equal(sanitizeFaq({ items: [] }).ok, false);
  assert.equal(sanitizeFaq({ items: [{ q: "", a: "x" }] }).ok, false);
  assert.equal(sanitizeFaq({ items: [{ q: "q<script>", a: "a" }] }).ok, false);
  assert.equal(sanitizeContent("faq", { items: [{ q: "Q", a: "A" }] }, OPTS).ok, true);
});

test("region resolution: draft wins ONLY in preview; anonymous reads never see drafts", () => {
  const rows = [
    { region_key: "intro", content_type: "richtext", content_json: { v: "published" }, seo_title: "T", seo_description: null, is_draft: false },
    { region_key: "intro", content_type: "richtext", content_json: { v: "draft" }, seo_title: "T2", seo_description: null, is_draft: true },
    { region_key: "guide", content_type: "richtext", content_json: { v: "draft-only" }, seo_title: null, seo_description: null, is_draft: true },
  ];
  const pub = resolveRegions(rows, false);
  assert.equal(pub.intro.json.v, "published");
  assert.equal(pub.intro.fromDraft, false);
  assert.equal(pub.guide, undefined, "draft-only region must be invisible to the public");

  const prev = resolveRegions(rows, true);
  assert.equal(prev.intro.json.v, "draft");
  assert.equal(prev.guide.json.v, "draft-only");
});

test("fallback: no override rows and DB-failure (null) both yield an empty map — code renders", () => {
  assert.deepEqual(resolveRegions([], false), {});
  assert.deepEqual(resolveRegions(null, false), {});
  assert.deepEqual(resolveRegions(null, true), {});
});

test("FAQ visible/schema sync: one array drives both surfaces", () => {
  // the contract is structural: the page derives BOTH the visible block and
  // FAQPage JSON-LD from the same sanitized items array
  const s = sanitizeFaq({ items: [{ q: "Q1", a: "A1" }, { q: "Q2", a: "A2" }] });
  assert.equal(s.ok, true);
  const items = s.doc.attrs.items;
  const jsonLd = items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }));
  const visible = items.map((f) => [f.q, f.a]);
  assert.equal(jsonLd.length, visible.length);
  assert.equal(jsonLd[0].name, visible[0][0]);
  assert.equal(jsonLd[1].acceptedAnswer.text, visible[1][1]);
});
