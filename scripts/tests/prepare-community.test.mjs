/* PREPARE FOR EXPORT validator — deterministic fixture tests over the pure
   gate (lib/editor/prepare.ts). The DB never participates: hero approval
   and gallery approvals are fixture inputs, content lint results are
   fixture inputs (the strict lint itself is exercised by the API route and
   covered by the exporter's rules), and the layout goes through the REAL
   sanitizer. Also covers stamp staleness: PREPARED is derived and any
   later edit clears it.
     node --test scripts/tests/prepare-community.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { prepareBlockers, preparedStampFresh } from "../../lib/editor/prepare.ts";
import { TEMPLATE_SECTIONS } from "../../lib/editor/blocks.ts";

const hoodSections = TEMPLATE_SECTIONS["template:hood"];

/** a fully valid hood-template layout doc, with optional per-section settings */
const layoutDoc = (settingsByKey = {}) => ({
  type: "layout",
  blocks: hoodSections.map((s) => ({
    kind: "section",
    key: s.key,
    hidden: false,
    visibility: "all",
    ...(settingsByKey[s.key] ? { settings: settingsByKey[s.key] } : {}),
  })),
});

/** the full-pass fixture: identity valid, READY, MLS evidence frozen,
    content READY with clean strict lint, hero approval mocked as a fixture
    asset, valid layout + CTA settings, gallery order over approved
    fixture slots */
const passingInput = (over = {}) => ({
  draft: {
    type: "new_build",
    name: "Fixture Villas",
    slug: "fixture-villas",
    lifecycle: "ready",
    statusLabel: "MODELS OPEN",
    fromLabel: "$4XXs",
    buildersCount: null,
    buildersLabel: "SEVERAL BUILDERS",
    hasMlsSnapshot: true,
    ...(over.draft ?? {}),
  },
  cityCanonical: true,
  content: { exists: true, ready: true, lintErrors: [] },
  heroApproved: true, // fixture-approved asset — no Photo Desk mutation
  routeDrafts: [
    {
      regionKey: "__layout",
      contentJson: layoutDoc({
        cta: { cta: { kicker: "FIELD NOTES", heading: "Tour the fixture models.", primaryLabel: "Ask about lots", primaryAction: "intent:ask-a-question", secondaryAction: "/homes?city=frisco" } },
        gallery: { gallery: { order: ["gallery-1", "gallery-0"] } },
      }),
      contentText: "Tour the fixture models. Ask about lots",
    },
    { regionKey: "tagline", contentJson: { type: "text", attrs: { value: "A fixture tagline." } }, contentText: "A fixture tagline." },
  ],
  approvedGallerySlots: new Set(["gallery-0", "gallery-1"]),
  citySlugs: ["frisco"],
  supabaseUrl: "https://example.supabase.co",
  ...over.top,
});

test("PREPARE succeeds on the complete valid fixture (and with empty gallery settings)", () => {
  assert.deepEqual(prepareBlockers(passingInput()), []);
  // gallery settings absent entirely — also clean
  const noGallery = passingInput();
  noGallery.routeDrafts[0].contentJson = layoutDoc();
  assert.deepEqual(prepareBlockers(noGallery), []);
  // no editor drafts at all — also clean
  const noDrafts = passingInput();
  noDrafts.routeDrafts = [];
  assert.deepEqual(prepareBlockers(noDrafts), []);
});

test("every axis blocks with its fixing tab", () => {
  const tabOf = (input) => prepareBlockers(input).map((b) => b.tab);

  const notReady = passingInput({ draft: { lifecycle: "draft" } });
  assert.ok(tabOf(notReady).includes("preview"));

  const noStatus = passingInput({ draft: { statusLabel: null } });
  assert.ok(tabOf(noStatus).includes("facts"));
  const noBuilders = passingInput({ draft: { buildersCount: null, buildersLabel: "" } });
  assert.ok(tabOf(noBuilders).includes("facts"));
  const noMls = passingInput({ draft: { hasMlsSnapshot: false } });
  assert.ok(tabOf(noMls).includes("facts"));

  const noContent = passingInput({ top: { content: { exists: false, ready: false, lintErrors: [] } } });
  assert.ok(tabOf(noContent).includes("content"));
  const lintDirty = passingInput({ top: { content: { exists: true, ready: true, lintErrors: [{ field: "intro", message: "too thin" }] } } });
  assert.ok(prepareBlockers(lintDirty).some((b) => b.tab === "content" && b.message.includes("too thin")));

  const noHero = passingInput({ top: { heroApproved: false } });
  assert.ok(tabOf(noHero).includes("photos"));

  const badSlug = passingInput({ draft: { slug: "Bad_Slug" } });
  assert.ok(tabOf(badSlug).includes("identity"));
});

test("layout drafts get publish-grade checks: bad CTA destination, unapproved gallery entry, risky claims", () => {
  const badCta = passingInput();
  badCta.routeDrafts[0].contentJson = layoutDoc({ cta: { cta: { primaryAction: "https://evil.example.com/x" } } });
  assert.ok(prepareBlockers(badCta).some((b) => b.tab === "arrange" && b.message.includes("destination")));

  const badGallery = passingInput();
  badGallery.routeDrafts[0].contentJson = layoutDoc({ gallery: { gallery: { order: ["gallery-5"] } } });
  assert.ok(prepareBlockers(badGallery).some((b) => b.tab === "photos" && b.message.includes('"gallery-5"')));

  const claimy = passingInput();
  claimy.routeDrafts[1] = { regionKey: "tagline", contentJson: { type: "text", attrs: { value: "Guaranteed appreciation here." } }, contentText: "Guaranteed appreciation here." };
  assert.ok(prepareBlockers(claimy).some((b) => b.tab === "arrange" && b.message.includes("guarantee")));
});

test("stamp freshness: any later facts/content/layout edit clears PREPARED", () => {
  const stamp = "2026-07-19T12:00:00.000Z";
  // fresh: stamp newer than (or equal to) every edit; missing axes ignored
  assert.equal(preparedStampFresh(stamp, ["2026-07-19T11:59:00.000Z", null, undefined]), true);
  assert.equal(preparedStampFresh(stamp, [stamp]), true);
  // stale: ONE later edit on any axis clears it
  assert.equal(preparedStampFresh(stamp, ["2026-07-19T11:00:00.000Z", "2026-07-19T12:00:01.000Z"]), false);
  assert.equal(preparedStampFresh(stamp, [null, null, "2026-07-20T00:00:00.000Z"]), false);
  // no stamp = never prepared
  assert.equal(preparedStampFresh(null, []), false);
  assert.equal(preparedStampFresh(undefined, ["2026-07-19T11:00:00.000Z"]), false);
});
