/* Visual Builder core contract tests — layout/nav sanitation, protected
   and required rules, H1 enforcement, slug validation, diffs, and the
   round-trip validity of every code layout + starter template.
     node --test scripts/tests/builder-core.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeLayout,
  sanitizeNav,
  validateSlug,
  diffLayouts,
  codeLayout,
  starterLayout,
  editorsPicksFromLayout,
  hoodCtaFromLayout,
  hoodGalleryFromLayout,
  isAllowedCtaAction,
  EDITORS_PICKS_DEFAULT,
  TEMPLATE_SECTIONS,
  SYSTEM_NAV,
} from "../../lib/editor/blocks.ts";

const SUPA = "https://example.supabase.co";
const bucketSrc = `${SUPA}/storage/v1/object/public/editorial-photos/editor/2026/x.jpg`;
let n = 0;
const uid = () => `blk-test${(n++).toString(36)}pad`;

const block = (type, settings = {}, extra = {}) => ({
  kind: "block",
  block: {
    id: uid(),
    type,
    hidden: false,
    visibility: "all",
    style: { treatment: "parchment", width: "constrained", align: "left", spacing: "md" },
    settings,
    ...extra,
  },
});
const hero = (level = "h1") => block("hero", { heading: "A page headline", sub: "", kicker: "", level, buttons: [] });
const layout = (...blocks) => ({ type: "layout", blocks });
const OPTS_CUSTOM = { pageKind: "custom", supabaseUrl: SUPA, requireImageAlt: true, citySlugs: ["frisco"] };
const hoodSections = TEMPLATE_SECTIONS["template:hood"];
const OPTS_HOOD = { pageKind: "template", sections: hoodSections, supabaseUrl: SUPA, requireImageAlt: true, citySlugs: ["frisco"] };

test("unknown block types and script-shaped content are refused", () => {
  const r1 = sanitizeLayout(layout(hero(), block("iframeEmbed", { src: "https://x.test" })), OPTS_CUSTOM);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => e.includes("unknown block type")));
  const r2 = sanitizeLayout(layout(hero(), block("richtext", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }] } })), OPTS_CUSTOM);
  assert.equal(r2.ok, false);
});

test("required/locked template sections cannot be hidden or dropped", () => {
  // hero hidden → refused
  const hiddenHero = { type: "layout", blocks: hoodSections.map((s) => ({ kind: "section", key: s.key, hidden: s.key === "hero", visibility: "all" })) };
  const r1 = sanitizeLayout(hiddenHero, OPTS_HOOD);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => /required and cannot be hidden|required/.test(e)));
  // schools (locked) dropped entirely → refused
  const dropped = { type: "layout", blocks: hoodSections.filter((s) => s.key !== "schools").map((s) => ({ kind: "section", key: s.key, hidden: false, visibility: "all" })) };
  const r2 = sanitizeLayout(dropped, OPTS_HOOD);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => /protected section .* missing/.test(e)));
  // hiding an eligible section (faq) is fine
  const hideFaq = { type: "layout", blocks: hoodSections.map((s) => ({ kind: "section", key: s.key, hidden: s.key === "faq", visibility: "all" })) };
  assert.equal(sanitizeLayout(hideFaq, OPTS_HOOD).ok, true);
});

test("H1 rules: custom pages need exactly one; templates can never mint one", () => {
  assert.equal(sanitizeLayout(layout(hero("h1")), OPTS_CUSTOM).ok, true);
  const none = sanitizeLayout(layout(block("richtext", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] } })), OPTS_CUSTOM);
  assert.equal(none.ok, false);
  assert.ok(none.errors.some((e) => /exactly one Hero/.test(e)));
  const two = sanitizeLayout(layout(hero("h1"), hero("h1")), OPTS_CUSTOM);
  assert.equal(two.ok, false);
  assert.ok(two.errors.some((e) => /only one H1/.test(e)));
  // hero blocks are refused on templates outright (onTemplates: false)
  const tpl = sanitizeLayout({ type: "layout", blocks: [...codeLayout("template:hood").blocks, hero("h1")] }, OPTS_HOOD);
  assert.equal(tpl.ok, false);
  assert.ok(tpl.errors.some((e) => /cannot be inserted into shared templates/.test(e)));
});

test("image blocks: hotlinks refused, alt required at publish, focal/settings coerced", () => {
  const hot = sanitizeLayout(layout(hero(), block("image", { image: { src: "https://images.unsplash.com/x.jpg", alt: "x" } })), OPTS_CUSTOM);
  assert.equal(hot.ok, false);
  assert.ok(hot.errors.some((e) => /no remote hotlinks/.test(e)));
  const noAlt = sanitizeLayout(layout(hero(), block("image", { image: { src: bucketSrc, alt: "" } })), OPTS_CUSTOM);
  assert.equal(noAlt.ok, false);
  assert.ok(noAlt.errors.some((e) => /alt text is required/.test(e)));
  const ok = sanitizeLayout(layout(hero(), block("image", { image: { src: bucketSrc, alt: "A porch", focal: "banana" }, placement: "sideways" })), OPTS_CUSTOM);
  assert.equal(ok.ok, true);
  const img = ok.doc.blocks[1].block.settings;
  assert.equal(img.image.focal, "center"); // coerced
  assert.equal(img.placement, "full"); // coerced
});

test("style enums coerce to the design system — no arbitrary values survive", () => {
  const r = sanitizeLayout(
    layout(hero(), block("quote", { text: "Quote", cite: "" }, { style: { treatment: "#ff00ff", width: "9999px", align: "justify", spacing: "-40px" } })),
    OPTS_CUSTOM
  );
  assert.equal(r.ok, true);
  const st = r.doc.blocks[1].block.style;
  assert.deepEqual(st, { treatment: "parchment", width: "constrained", align: "left", spacing: "md" });
});

test("buttons: unsafe protocols and admin routes are refused", () => {
  const r = sanitizeLayout(
    layout(hero(), block("cta", { heading: "Go", body: "", kicker: "", buttons: [{ label: "x", href: "javascript:alert(1)", style: "primary" }, { label: "y", href: "/admin/editor", style: "primary" }] })),
    OPTS_CUSTOM
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /not an allowed URL/.test(e)));
  assert.ok(r.errors.some((e) => /admin\/account\/api\/auth/.test(e)));
});

test("every code layout round-trips through the sanitizer unchanged-valid", () => {
  for (const key of Object.keys(TEMPLATE_SECTIONS)) {
    const r = sanitizeLayout(codeLayout(key), { pageKind: "template", sections: TEMPLATE_SECTIONS[key], supabaseUrl: SUPA, requireImageAlt: true });
    assert.equal(r.ok, true, `${key}: ${r.errors.join("; ")}`);
    assert.equal(r.doc.blocks.length, TEMPLATE_SECTIONS[key].length);
  }
});

test("every New Page starter template sanitizes clean as a custom page", () => {
  for (const t of ["blank", "landing", "buyer-guide", "seller-guide", "about-team", "contact", "listings-landing"]) {
    const r = sanitizeLayout(starterLayout(t, uid), OPTS_CUSTOM);
    assert.equal(r.ok, true, `${t}: ${r.errors.join("; ")}`);
  }
});

test("navigation: system links preserved, admin routes refused, dupes refused, SEARCH unhideable", () => {
  const base = SYSTEM_NAV.map((s) => ({ key: s.key, label: s.label, href: s.href, kind: "system", hidden: false }));
  const ok = sanitizeNav({ type: "nav", items: [...base, { key: "sellers", label: "SELLERS", href: "/sellers-guide", kind: "page", hidden: false }] }, { publishedPageSlugs: ["sellers-guide"] });
  assert.equal(ok.ok, true, ok.errors.join("; "));

  const admin = sanitizeNav({ type: "nav", items: [...base, { key: "sneak", label: "ADMIN", href: "/admin", kind: "page", hidden: false }] }, { publishedPageSlugs: [] });
  assert.equal(admin.ok, false);
  assert.ok(admin.errors.some((e) => /never enter public navigation/.test(e)));

  const unpublished = sanitizeNav({ type: "nav", items: [...base, { key: "drafty", label: "DRAFT", href: "/secret-draft", kind: "page", hidden: false }] }, { publishedPageSlugs: [] });
  assert.equal(unpublished.ok, false);

  const dupe = sanitizeNav({ type: "nav", items: [...base, { key: "again", label: "LAND TWO", href: "/land", kind: "page", hidden: false }] }, { publishedPageSlugs: [] });
  assert.equal(dupe.ok, false);

  // dropping every system item → they are restored
  const empty = sanitizeNav({ type: "nav", items: [] }, { publishedPageSlugs: [] });
  assert.equal(empty.doc.items.length, SYSTEM_NAV.length);

  // SEARCH HOMES cannot hide
  const hideSearch = sanitizeNav({ type: "nav", items: base.map((i) => (i.key === "search" ? { ...i, hidden: true } : i)) }, { publishedPageSlugs: [] });
  assert.equal(hideSearch.doc.items.find((i) => i.key === "search").hidden, false);
});

test("slug validation: format, reserved routes, collisions", () => {
  assert.deepEqual(validateSlug("sellers-guide", []), []);
  assert.ok(validateSlug("Sellers Guide", []).length > 0);
  assert.ok(validateSlug("homes", []).some((e) => /reserved/.test(e)));
  assert.ok(validateSlug("admin", []).some((e) => /reserved/.test(e)));
  assert.ok(validateSlug("city", []).some((e) => /reserved/.test(e)));
  assert.ok(validateSlug("sellers-guide", ["sellers-guide"]).some((e) => /already exists/.test(e)));
  assert.ok(validateSlug("ab", []).length > 0);
});

test("diff summarizes added/removed/moved/hidden/edited", () => {
  const secs = TEMPLATE_SECTIONS["/how-we-research"];
  const a = codeLayout("/how-we-research");
  const b = {
    type: "layout",
    blocks: [
      a.blocks[0],
      { ...a.blocks[2] }, // closing moved up
      { ...a.blocks[1], hidden: true }, // sources hidden (eligible)
      block("cta", { heading: "New CTA", body: "", kicker: "", buttons: [] }),
    ],
  };
  const d = diffLayouts(a, b, secs);
  assert.ok(d.added.some((x) => /CTA Band/.test(x)));
  assert.ok(d.hidden.some((x) => /Source rules/.test(x)));
  assert.ok(d.moved.length >= 1);
  const d2 = diffLayouts(a, { type: "layout", blocks: a.blocks.slice(0, 2) }, secs);
  assert.ok(d2.removed.length === 1);
});

test("diff is key-order-canonical: a jsonb round-trip is NOT an edit", () => {
  const secs = TEMPLATE_SECTIONS["/how-we-research"];
  const a = codeLayout("/how-we-research");
  // simulate Postgres jsonb key reordering (shortest key first, then bytewise)
  const b = {
    type: "layout",
    blocks: a.blocks.map((e) => ({ key: e.key, kind: e.kind, hidden: e.hidden, visibility: e.visibility })),
  };
  const d = diffLayouts(a, b, secs);
  assert.deepEqual(d, { added: [], removed: [], moved: [], hidden: [], shown: [], edited: [] });
});

test("editor's picks card settings: 4 canonical distinct cities, tagline capped, identity normalizes away", () => {
  const CITIES = ["denton", "fort-worth", "dallas", "frisco", "plano", "allen"];
  const homeSections = TEMPLATE_SECTIONS["/"];
  const withPicks = (picks) => ({
    type: "layout",
    blocks: homeSections.map((s) =>
      s.key === "picks"
        ? { kind: "section", key: "picks", hidden: false, visibility: "all", settings: { picks } }
        : { kind: "section", key: s.key, hidden: false, visibility: "all" }
    ),
  });
  const OPTS = { pageKind: "template", sections: homeSections, supabaseUrl: SUPA, requireImageAlt: true, citySlugs: CITIES };

  // a real override round-trips
  const ok = sanitizeLayout(withPicks([{ city: "plano", tagline: "  Big city, tidy lawns.  " }, { city: "fort-worth" }, { city: "dallas" }, { city: "frisco" }]), OPTS);
  assert.equal(ok.ok, true, ok.errors.join("; "));
  const picks = editorsPicksFromLayout(ok.doc);
  assert.deepEqual(picks.map((p) => p.city), ["plano", "fort-worth", "dallas", "frisco"]);
  assert.equal(picks[0].tagline, "Big city, tidy lawns.");
  assert.equal(picks[1].tagline, undefined);

  // wrong count refused
  assert.equal(sanitizeLayout(withPicks([{ city: "plano" }]), OPTS).ok, false);
  // duplicate city refused
  const dup = sanitizeLayout(withPicks([{ city: "plano" }, { city: "plano" }, { city: "dallas" }, { city: "frisco" }]), OPTS);
  assert.equal(dup.ok, false);
  assert.ok(dup.errors.some((e) => /different city/.test(e)));
  // non-canonical city refused
  const bogus = sanitizeLayout(withPicks([{ city: "gotham" }, { city: "fort-worth" }, { city: "dallas" }, { city: "frisco" }]), OPTS);
  assert.equal(bogus.ok, false);
  assert.ok(bogus.errors.some((e) => /not a canonical DFW city/.test(e)));
  // script-shaped tagline refused by the global guard
  assert.equal(sanitizeLayout(withPicks([{ city: "plano", tagline: "<script>x</script>" }, { city: "fort-worth" }, { city: "dallas" }, { city: "frisco" }]), OPTS).ok, false);
  // settings on a section without a cards contract refused
  const wrongSection = {
    type: "layout",
    blocks: homeSections.map((s) =>
      s.key === "about"
        ? { kind: "section", key: "about", hidden: false, visibility: "all", settings: { picks: [{ city: "plano" }, { city: "fort-worth" }, { city: "dallas" }, { city: "frisco" }] } }
        : { kind: "section", key: s.key, hidden: false, visibility: "all" }
    ),
  };
  assert.equal(sanitizeLayout(wrongSection, OPTS).ok, false);
  // the DEFAULT lineup with no taglines stores NO settings (identity stays clean)
  const identity = sanitizeLayout(withPicks(EDITORS_PICKS_DEFAULT.map((city) => ({ city }))), OPTS);
  assert.equal(identity.ok, true, identity.errors.join("; "));
  assert.equal(editorsPicksFromLayout(identity.doc), null);
  // absent settings = null lineup
  assert.equal(editorsPicksFromLayout(codeLayout("/")), null);
});

test("fallback: a null layout renders code order (applyLayout contract is null-safe)", () => {
  // the pure part of the contract: codeLayout(route) IS the code order
  const cl = codeLayout("/");
  assert.deepEqual(cl.blocks.map((b) => b.key), TEMPLATE_SECTIONS["/"].map((s) => s.key));
});

/* ---------------------------------------------- hood CTA override (A2) */
const withCta = (cta, key = "cta") => ({
  type: "layout",
  blocks: hoodSections.map((s) =>
    s.key === key
      ? { kind: "section", key: s.key, hidden: false, visibility: "all", settings: { cta } }
      : { kind: "section", key: s.key, hidden: false, visibility: "all" }
  ),
});

test("hood CTA override: sanitized fields, lead intents, validated internal paths", () => {
  const r = sanitizeLayout(
    withCta({
      kicker: "  FIELD NOTES ",
      heading: "Talk to a <b>local</b> guide about Starlight Meadows.",
      body: "Real answers about lots, timelines, and builder trade-offs.",
      primaryLabel: "Ask about lots",
      primaryAction: "intent:ask-a-question",
      secondaryLabel: "See Frisco homes",
      secondaryAction: "/homes?city=frisco",
    }),
    OPTS_HOOD
  );
  assert.equal(r.ok, true, r.errors.join("; "));
  const cta = hoodCtaFromLayout(r.doc);
  assert.equal(cta.kicker, "FIELD NOTES");
  assert.equal(cta.heading, "Talk to a local guide about Starlight Meadows."); // tags stripped
  assert.equal(cta.primaryAction, "intent:ask-a-question");
  assert.equal(cta.secondaryAction, "/homes?city=frisco");
  // override text feeds the claims linter at publish time
  assert.ok(r.text.includes("Talk to a local guide"));
});

test("hood CTA override: unsafe/external/broken destinations are refused", () => {
  for (const bad of [
    "https://tracking.example.com/x?utm_source=spam",
    "javascript:alert(1)",
    "/admin/editor",
    "/api/leads",
    "/city/nowhere-town", // not a canonical city
    "not-a-path",
  ]) {
    const r = sanitizeLayout(withCta({ primaryAction: bad }), OPTS_HOOD);
    assert.equal(r.ok, false, `should refuse ${bad}`);
    assert.ok(r.errors.some((e) => e.includes("destination")), `error names the destination for ${bad}`);
  }
  const r2 = sanitizeLayout(withCta({ primaryAction: "intent:not-a-real-intent" }), OPTS_HOOD);
  assert.equal(r2.ok, false);
});

test("hood CTA override: empty settings normalize AWAY (code CTA stays byte-for-byte)", () => {
  const r = sanitizeLayout(withCta({ kicker: "", heading: "  ", hideSecondary: false }), OPTS_HOOD);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(hoodCtaFromLayout(r.doc), null);
  const entry = r.doc.blocks.find((b) => b.kind === "section" && b.key === "cta");
  assert.equal(entry.settings, undefined);
  // absent layout = no override
  assert.equal(hoodCtaFromLayout(null), null);
  assert.equal(hoodCtaFromLayout(codeLayout("template:hood")), null);
});

test("hood CTA override: hideSecondary survives; non-cta sections refuse settings", () => {
  const r = sanitizeLayout(withCta({ heading: "One ask only.", hideSecondary: true }), OPTS_HOOD);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(hoodCtaFromLayout(r.doc).hideSecondary, true);
  const r2 = sanitizeLayout(withCta({ heading: "Nope." }, "faq"), OPTS_HOOD);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => e.includes("does not accept settings")));
});

/* ---------------------------------------------- hood gallery order (A3) */
const withGallery = (gallery, hidden = false) => ({
  type: "layout",
  blocks: hoodSections.map((s) =>
    s.key === "gallery"
      ? { kind: "section", key: "gallery", hidden, visibility: "all", settings: { gallery } }
      : { kind: "section", key: s.key, hidden: false, visibility: "all" }
  ),
});

test("hood gallery order: valid slot keys survive, dedup applies, order is preserved", () => {
  const r = sanitizeLayout(withGallery({ order: ["gallery-2", "gallery-0", "gallery-2"] }), OPTS_HOOD);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.deepEqual(hoodGalleryFromLayout(r.doc), ["gallery-2", "gallery-0"]);
});

test("hood gallery order: ad hoc slot keys are refused; empty order normalizes away", () => {
  const bad = sanitizeLayout(withGallery({ order: ["gallery-2", "my-cool-photo"] }), OPTS_HOOD);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("not a valid slot key")));
  const empty = sanitizeLayout(withGallery({ order: [] }), OPTS_HOOD);
  assert.equal(empty.ok, true, empty.errors.join("; "));
  assert.equal(hoodGalleryFromLayout(empty.doc), null);
  const entry = empty.doc.blocks.find((b) => b.kind === "section" && b.key === "gallery");
  assert.equal(entry.settings, undefined);
});

test("hood gallery order: a HIDDEN gallery section yields no visible order (nothing to gate)", () => {
  const r = sanitizeLayout(withGallery({ order: ["gallery-0"] }, true), OPTS_HOOD);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(hoodGalleryFromLayout(r.doc), null);
  // absent layout = default order
  assert.equal(hoodGalleryFromLayout(null), null);
  assert.equal(hoodGalleryFromLayout(codeLayout("template:hood")), null);
});

test("isAllowedCtaAction: the closed destination world", () => {
  const citySet = new Set(["frisco"]);
  for (const ok of ["/", "/homes", "/land", "/new-builds", "/how-we-research", "/#map", "/city/frisco", "/city/frisco/starlight-meadows", "/homes?city=frisco", "intent:curated-homes"]) {
    assert.equal(isAllowedCtaAction(ok, citySet), true, `should allow ${ok}`);
  }
  for (const bad of ["", "https://x.test", "//evil", "/city/frisco/x/y", "/homes?city=frisco&utm=1", "/listing/123", "intent:", "mailto:x@y.z"]) {
    assert.equal(isAllowedCtaAction(bad, citySet), false, `should refuse ${bad}`);
  }
});
