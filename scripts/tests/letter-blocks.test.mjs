/* The Letter block model — validation, unsafe-HTML rejection, compliance
   footer preservation, image alt/attribution requirements, claims lint,
   legacy conversion, and the dual HTML/plain-text render.
     node --test scripts/tests/letter-blocks.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeLetterDoc,
  lintLetterDoc,
  renderLetterEmail,
  defaultLetterDoc,
  letterDocFromLegacy,
  isLetterDoc,
  UNSUB_PLACEHOLDER,
  LETTER_POSTAL_ADDRESS,
} from "../../lib/email/letter-blocks.ts";

const SUPA = "https://example.supabase.co";
const IMG = `${SUPA}/storage/v1/object/public/editorial-photos/slots/x/y/z.jpg`;
const rich = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const validDoc = () => ({
  type: "letter",
  preheader: "The week, briefly.",
  blocks: [
    { id: "blk-masthead", type: "masthead" },
    { id: "blk-note", type: "editors-note", doc: rich("A calm Sunday read about the metro market, written for people who like their numbers dated and their claims sourced. Nothing here guesses.") },
    { id: "blk-numbers", type: "week-in-numbers" },
    { id: "blk-movers", type: "market-movers", count: 5 },
    { id: "blk-cta", type: "cta", label: "Search homes", href: "/homes" },
  ],
});

const stats = {
  generatedAt: "2026-07-19T12:00:00Z",
  metro: { actives: 44210, new7d: 1892 },
  cities: [
    { slug: "frisco", name: "Frisco", actives: 900, new7d: 60, median: 700000, medianPrev: 690000 },
    { slug: "celina", name: "Celina", actives: 500, new7d: 45, median: 560000, medianPrev: 780000 }, // absurd delta → suppressed
  ],
};

test("a valid document sanitizes clean; unknown block types (incl. footer) refuse", () => {
  const r = sanitizeLetterDoc(validDoc(), { supabaseUrl: SUPA });
  assert.equal(r.ok, true, r.errors.join("; "));
  const bad = validDoc();
  bad.blocks.push({ id: "blk-footer", type: "footer" });
  const r2 = sanitizeLetterDoc(bad, { supabaseUrl: SUPA });
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => e.includes("footer is code-owned")));
});

test("unsafe HTML is rejected: scripts, iframes, forms, event handlers", () => {
  for (const payload of ["<script>alert(1)</script>", "<iframe src=x>", "<form action=x>", "<img onerror=alert(1)>", "javascript:void(0)"]) {
    const d = validDoc();
    d.blocks[1] = { id: "blk-note", type: "editors-note", doc: rich(payload) };
    const r = sanitizeLetterDoc(d, { supabaseUrl: SUPA });
    assert.equal(r.ok, false, `should refuse ${payload}`);
  }
});

test("the compliance footer renders ALWAYS — identity, postal address, unsubscribe, after content", () => {
  const s = sanitizeLetterDoc(validDoc(), { supabaseUrl: SUPA });
  const { html, text } = renderLetterEmail({ issueDate: "2026-07-26", subject: "The week, measured.", doc: s.doc, stats });
  assert.ok(html.includes(UNSUB_PLACEHOLDER), "html carries the per-recipient unsubscribe placeholder");
  assert.ok(html.includes(LETTER_POSTAL_ADDRESS.toUpperCase()), "html carries the postal address");
  assert.ok(html.includes("DISCOVER DFW"), "html carries the identity");
  assert.ok(html.lastIndexOf(UNSUB_PLACEHOLDER) > html.lastIndexOf("Search homes"), "footer sits below marketing content");
  assert.ok(text.includes(UNSUB_PLACEHOLDER) && text.includes(LETTER_POSTAL_ADDRESS), "plain text carries footer too");
  // even an adversarial doc with zero blocks still gets the footer at render
  const bare = renderLetterEmail({ issueDate: "2026-07-26", subject: "x", doc: { type: "letter", preheader: "", blocks: [] }, stats: null });
  assert.ok(bare.html.includes(UNSUB_PLACEHOLDER) && bare.html.includes(LETTER_POSTAL_ADDRESS.toUpperCase()));
});

test("images require approved sources, alt text, and attribution; links stay internal", () => {
  const noAlt = validDoc();
  noAlt.blocks.push({ id: "blk-img", type: "image", src: IMG, alt: "", caption: "", attribution: "PHOTO: DISCOVER DFW", href: "" });
  assert.equal(sanitizeLetterDoc(noAlt, { supabaseUrl: SUPA }).ok, false);
  const noAttr = validDoc();
  noAttr.blocks.push({ id: "blk-img", type: "image", src: IMG, alt: "A street", caption: "", attribution: "", href: "" });
  assert.equal(sanitizeLetterDoc(noAttr, { supabaseUrl: SUPA }).ok, false);
  const hotlink = validDoc();
  hotlink.blocks.push({ id: "blk-img", type: "image", src: "https://evil.example.com/x.jpg", alt: "A", attribution: "B", caption: "", href: "" });
  assert.equal(sanitizeLetterDoc(hotlink, { supabaseUrl: SUPA }).ok, false);
  const extCta = validDoc();
  extCta.blocks.push({ id: "blk-x", type: "cta", label: "Go", href: "https://elsewhere.example.com" });
  assert.equal(sanitizeLetterDoc(extCta, { supabaseUrl: SUPA }).ok, false);
  const good = validDoc();
  good.blocks.push({ id: "blk-img", type: "image", src: IMG, alt: "New homes at dusk", caption: "Bridgewater", attribution: "PHOTO: DISCOVER DFW", href: "/city/midlothian/bridgewater" });
  assert.equal(sanitizeLetterDoc(good, { supabaseUrl: SUPA }).ok, true);
});

test("masthead: required, unhideable, forced first", () => {
  const noMast = validDoc();
  noMast.blocks = noMast.blocks.filter((b) => b.type !== "masthead");
  assert.equal(sanitizeLetterDoc(noMast, { supabaseUrl: SUPA }).ok, false);
  const late = validDoc();
  late.blocks.push(late.blocks.shift()); // masthead to the end
  const r = sanitizeLetterDoc(late, { supabaseUrl: SUPA });
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.doc.blocks[0].type, "masthead");
  const hiddenMast = validDoc();
  hiddenMast.blocks[0] = { ...hiddenMast.blocks[0], hidden: true };
  assert.equal(sanitizeLetterDoc(hiddenMast, { supabaseUrl: SUPA }).ok, false);
});

test("lint: claims screen + quality gates over subject and all text blocks", () => {
  const claims = validDoc();
  claims.blocks[1] = { id: "blk-note", type: "editors-note", doc: rich("Guaranteed appreciation and the best school district in Texas await, plus this community is zoned to Guyer High forever and pricing will only rise.") };
  const l = lintLetterDoc("The week, measured.", claims, { supabaseUrl: SUPA });
  assert.ok(l.errors.length > 0, "risky claims must block");
  const short = lintLetterDoc("ok", { ...validDoc(), blocks: [validDoc().blocks[0], { id: "blk-n", type: "editors-note", doc: rich("Too short.") }, validDoc().blocks[2]] }, { supabaseUrl: SUPA });
  assert.ok(short.errors.some((e) => e.includes("at least 120")));
  assert.ok(lintLetterDoc("", validDoc(), { supabaseUrl: SUPA }).errors.some((e) => e.includes("subject is required")));
  assert.equal(lintLetterDoc("The week, measured.", validDoc(), { supabaseUrl: SUPA }).errors.length, 0);
});

test("market numbers render only from frozen NTREIS stats; absurd deltas suppress", () => {
  const s = sanitizeLetterDoc(validDoc(), { supabaseUrl: SUPA });
  const { html } = renderLetterEmail({ issueDate: "2026-07-26", subject: "S", doc: s.doc, stats });
  assert.ok(html.includes("44,210") && html.includes("1,892"), "metro numbers from stats_json");
  assert.ok(html.includes("+1.4% WK"), "sane delta renders");
  assert.ok(!html.includes("-28.2"), "absurd delta suppressed (data artifact guard)");
  // without stats the NTREIS blocks render nothing rather than inventing numbers
  const bare = renderLetterEmail({ issueDate: "2026-07-26", subject: "S", doc: s.doc, stats: null });
  assert.ok(!bare.html.includes("WEEK IN NUMBERS"));
});

test("legacy issues convert losslessly; block docs are recognized", () => {
  const legacy = { editorsNote: "First paragraph.\n\nSecond paragraph.", communityOfWeek: { citySlug: "midlothian", hoodSlug: "bridgewater", name: "Bridgewater", blurb: "A new-build community with multiple active builders." } };
  const doc = letterDocFromLegacy(legacy);
  assert.equal(isLetterDoc(doc), true);
  assert.equal(isLetterDoc(legacy), false);
  const note = doc.blocks.find((b) => b.type === "editors-note");
  assert.equal(note.doc.content.length, 2);
  const cow = doc.blocks.find((b) => b.type === "community-spotlight");
  assert.equal(cow.citySlug, "midlothian");
  const r = sanitizeLetterDoc(doc, { supabaseUrl: SUPA });
  assert.equal(r.ok, true, r.errors.join("; "));
  const { html, text } = renderLetterEmail({ issueDate: "2026-07-26", subject: "S", doc: r.doc, stats });
  assert.ok(html.includes("Second paragraph.") && html.includes("Bridgewater"));
  assert.ok(text.includes("Second paragraph.") && text.includes("COMMUNITY SPOTLIGHT: Bridgewater"));
});

test("the default document is valid and the plain-text render mirrors the html blocks", () => {
  const r = sanitizeLetterDoc(defaultLetterDoc(), { supabaseUrl: SUPA });
  assert.equal(r.ok, true, r.errors.join("; "));
  const withNote = validDoc();
  const { html, text } = renderLetterEmail({ issueDate: "2026-07-26", subject: "S", doc: sanitizeLetterDoc(withNote, { supabaseUrl: SUPA }).doc, stats, isTest: true });
  assert.ok(html.includes("TEST COPY — NOT A SUBSCRIBER SEND"));
  assert.ok(text.includes("calm Sunday read"));
  assert.ok(text.includes("Search homes:"));
});
