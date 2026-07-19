/* Canvas bridge protocol — strict validation both directions + the
   canvas error-state transitions.
     node --test scripts/tests/bridge-protocol.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BB_NS,
  parseCanvasMsg,
  parseShellMsg,
  isEntryId,
  canvasStatusNext,
} from "../../lib/editor/bridge-protocol.ts";

const meta = (id = "b:blk-abc123") => ({
  id,
  label: "Hero",
  kind: "block",
  locked: false,
  required: false,
  hideable: true,
  deletable: true,
  movable: true,
  hidden: false,
  fields: [{ field: "heading", kind: "plain" }],
  regions: [],
});

test("foreign namespaces, non-objects, and unknown types are dropped", () => {
  assert.equal(parseCanvasMsg(null), null);
  assert.equal(parseCanvasMsg("ready"), null);
  assert.equal(parseCanvasMsg({ t: "ready", ids: [] }), null); // no ns
  assert.equal(parseCanvasMsg({ ns: "evil", t: "ready", ids: [] }), null);
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "exec", code: "alert(1)" }), null);
  assert.equal(parseShellMsg({ ns: BB_NS, t: "eval", html: "x" }), null);
});

test("entry ids are shape-checked everywhere", () => {
  assert.ok(isEntryId("s:hero"));
  assert.ok(isEntryId("b:blk-m3k2j4h5"));
  assert.equal(isEntryId("s:../etc"), false);
  assert.equal(isEntryId("x:hero"), false);
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "select", id: "x:nope" }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "select", id: null }));
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "select", id: "s:hero" }));
});

test("canvas → shell messages validate field-by-field", () => {
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "ready", ids: ["s:hero", "b:blk-a1"] }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "ready", ids: ["s:hero", 42] }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "reorder", ids: ["s:a", "s:b"], moved: "s:b" }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "reorder", ids: ["s:a"], moved: "not-an-id" }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "action", id: "b:blk-a1", action: "hide" }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "action", id: "b:blk-a1", action: "explode" }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "field", id: "b:blk-a1", field: "heading", value: "Hi" }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "field", id: "b:blk-a1", field: "heading", value: "x".repeat(3000) }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "region", region: "hero-copy", html: "<p>x</p>", original: null }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "region", region: "../nav", html: "<p>x</p>", original: null }), null);
  assert.ok(parseCanvasMsg({ ns: BB_NS, t: "height", px: 4200 }));
  assert.equal(parseCanvasMsg({ ns: BB_NS, t: "height", px: -5 }), null);
});

test("shell → canvas messages validate metas and payload sizes", () => {
  assert.ok(parseShellMsg({ ns: BB_NS, t: "init", metas: [meta()], order: ["b:blk-abc123"] }));
  assert.equal(parseShellMsg({ ns: BB_NS, t: "init", metas: [{ ...meta(), kind: "wizard" }], order: [] }), null);
  assert.ok(parseShellMsg({ ns: BB_NS, t: "replace", id: "b:blk-a1", html: "<section>x</section>" }));
  assert.ok(parseShellMsg({ ns: BB_NS, t: "insert", index: 2, html: "<section>x</section>", meta: meta() }));
  assert.equal(parseShellMsg({ ns: BB_NS, t: "insert", index: -1, html: "x", meta: meta() }), null);
  assert.ok(parseShellMsg({ ns: BB_NS, t: "hidden", id: "s:faq", hidden: true }));
  assert.equal(parseShellMsg({ ns: BB_NS, t: "hidden", id: "s:faq", hidden: "yes" }), null);
  assert.ok(parseShellMsg({ ns: BB_NS, t: "overlays", on: false }));
});

test("canvas error-state machine covers every visible failure mode", () => {
  const loading = canvasStatusNext({ s: "ready" }, { kind: "load-start" });
  assert.deepEqual(loading, { s: "loading" });
  // auth failure (preview route 404s when not admin)
  assert.deepEqual(canvasStatusNext(loading, { kind: "preflight", httpStatus: 404 }), { s: "error", code: "auth" });
  // unknown route
  assert.deepEqual(canvasStatusNext(loading, { kind: "preflight", httpStatus: 400 }), { s: "error", code: "route" });
  // server failure loading the draft
  assert.equal(canvasStatusNext(loading, { kind: "preflight", httpStatus: 503 }).code, "draft");
  // healthy preflight keeps loading until the bridge reports in
  assert.deepEqual(canvasStatusNext(loading, { kind: "preflight", httpStatus: 200 }), { s: "loading" });
  assert.deepEqual(canvasStatusNext(loading, { kind: "bridge-ready" }), { s: "ready" });
  // a load that never connects times out to a bridge error…
  assert.deepEqual(canvasStatusNext(loading, { kind: "timeout" }), { s: "error", code: "bridge" });
  // …but a ready canvas is not clobbered by a stale timer
  assert.deepEqual(canvasStatusNext({ s: "ready" }, { kind: "timeout" }), { s: "ready" });
  // runtime render error + disconnection are visible states
  assert.equal(canvasStatusNext({ s: "ready" }, { kind: "bridge-error", message: "boom" }).code, "render");
  assert.equal(canvasStatusNext({ s: "ready" }, { kind: "disconnected" }).code, "bridge");
});
