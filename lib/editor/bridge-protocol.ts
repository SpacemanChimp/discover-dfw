/* Visual Builder canvas bridge protocol — the ONLY vocabulary the admin
   shell and the in-canvas page runtime may exchange over postMessage.

   Both directions are STRICTLY validated: same-origin is enforced by the
   callers (event.origin === location.origin AND a known event.source), and
   every message must parse through the guards here — unknown types, wrong
   shapes, or foreign namespaces are dropped silently. No wildcard origins,
   no arbitrary payloads, no function/HTML execution: HTML strings only
   travel SHELL → CANVAS, and the shell only ever forwards HTML produced by
   the admin-gated server renderer (never canvas- or user-authored markup).

   Pure module — importable from client, server, and node tests. */

export const BB_NS = "dfw-builder-v1";

/** inline-editable text field on a block, as rendered with data-bb-field */
export interface FieldMeta {
  field: string;
  kind: "plain" | "rich";
}

/** everything the canvas runtime needs to know about one layout entry */
export interface CanvasEntryMeta {
  id: string; // "s:<sectionKey>" | "b:<blockId>"
  label: string;
  kind: "section" | "block";
  /** locked/required section or protected block — explain, never delete */
  locked: boolean;
  required: boolean;
  hideable: boolean;
  deletable: boolean;
  movable: boolean;
  hidden: boolean;
  fields: FieldMeta[];
  /** 0018 content regions (data-bb-region) inside this section */
  regions: { key: string; label: string }[];
}

/* ------------------------------------------------------- canvas → shell */
export type CanvasMsg =
  | { ns: typeof BB_NS; t: "ready"; ids: string[] }
  | { ns: typeof BB_NS; t: "select"; id: string | null }
  | { ns: typeof BB_NS; t: "reorder"; ids: string[]; moved: string }
  | { ns: typeof BB_NS; t: "action"; id: string; action: "hide" | "show" | "duplicate" | "copy" | "delete" }
  | { ns: typeof BB_NS; t: "insertAt"; index: number }
  | { ns: typeof BB_NS; t: "field"; id: string; field: string; value: string }
  | { ns: typeof BB_NS; t: "rich"; id: string; field: string; html: string }
  | { ns: typeof BB_NS; t: "region"; region: string; html: string; original: string | null }
  | { ns: typeof BB_NS; t: "navigate"; href: string }
  | { ns: typeof BB_NS; t: "height"; px: number }
  | { ns: typeof BB_NS; t: "error"; message: string };

/* ------------------------------------------------------- shell → canvas */
export type ShellMsg =
  | { ns: typeof BB_NS; t: "init"; metas: CanvasEntryMeta[]; order: string[] }
  | { ns: typeof BB_NS; t: "meta"; metas: CanvasEntryMeta[] }
  | { ns: typeof BB_NS; t: "order"; ids: string[] }
  | { ns: typeof BB_NS; t: "hidden"; id: string; hidden: boolean }
  | { ns: typeof BB_NS; t: "replace"; id: string; html: string }
  | { ns: typeof BB_NS; t: "insert"; index: number; html: string; meta: CanvasEntryMeta }
  | { ns: typeof BB_NS; t: "remove"; id: string }
  | { ns: typeof BB_NS; t: "select"; id: string | null }
  | { ns: typeof BB_NS; t: "scrollTo"; id: string }
  | { ns: typeof BB_NS; t: "field"; id: string; field: string; value: string }
  | { ns: typeof BB_NS; t: "regionHtml"; region: string; html: string }
  | { ns: typeof BB_NS; t: "overlays"; on: boolean };

/* -------------------------------------------------------------- guards */
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr) && v.length <= 500;

/** entry id shapes the wrappers actually emit */
export const isEntryId = (v: unknown): v is string => isStr(v) && /^(s:[a-z0-9-]{1,40}|b:[a-zA-Z0-9-]{1,48})$/.test(v);

const CANVAS_ACTIONS = new Set(["hide", "show", "duplicate", "copy", "delete"]);

function isFieldMeta(v: unknown): v is FieldMeta {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return isStr(f.field) && (f.kind === "plain" || f.kind === "rich");
}

export function isEntryMeta(v: unknown): v is CanvasEntryMeta {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    isEntryId(m.id) &&
    isStr(m.label) &&
    (m.kind === "section" || m.kind === "block") &&
    isBool(m.locked) &&
    isBool(m.required) &&
    isBool(m.hideable) &&
    isBool(m.deletable) &&
    isBool(m.movable) &&
    isBool(m.hidden) &&
    Array.isArray(m.fields) &&
    m.fields.every(isFieldMeta) &&
    Array.isArray(m.regions) &&
    m.regions.every((r) => !!r && typeof r === "object" && isStr((r as { key?: unknown }).key) && isStr((r as { label?: unknown }).label))
  );
}

function base(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ns !== BB_NS || !isStr(d.t)) return null;
  return d;
}

/** validate a message ARRIVING FROM the canvas (used by the admin shell) */
export function parseCanvasMsg(data: unknown): CanvasMsg | null {
  const d = base(data);
  if (!d) return null;
  switch (d.t) {
    case "ready":
      return isStrArray(d.ids) && d.ids.every(isEntryId) ? { ns: BB_NS, t: "ready", ids: d.ids } : null;
    case "select":
      return d.id === null || isEntryId(d.id) ? { ns: BB_NS, t: "select", id: (d.id as string | null) } : null;
    case "reorder":
      return isStrArray(d.ids) && d.ids.every(isEntryId) && isEntryId(d.moved)
        ? { ns: BB_NS, t: "reorder", ids: d.ids, moved: d.moved }
        : null;
    case "action":
      return isEntryId(d.id) && isStr(d.action) && CANVAS_ACTIONS.has(d.action)
        ? { ns: BB_NS, t: "action", id: d.id, action: d.action as "hide" | "show" | "duplicate" | "copy" | "delete" }
        : null;
    case "insertAt":
      return isNum(d.index) && d.index >= 0 && d.index <= 500 ? { ns: BB_NS, t: "insertAt", index: Math.floor(d.index) } : null;
    case "field":
      return isEntryId(d.id) && isStr(d.field) && d.field.length <= 40 && isStr(d.value) && d.value.length <= 2000
        ? { ns: BB_NS, t: "field", id: d.id, field: d.field, value: d.value }
        : null;
    case "rich":
      return isEntryId(d.id) && isStr(d.field) && d.field.length <= 40 && isStr(d.html) && d.html.length <= 100_000
        ? { ns: BB_NS, t: "rich", id: d.id, field: d.field, html: d.html }
        : null;
    case "region":
      return isStr(d.region) && /^[a-z0-9-]{1,40}$/.test(d.region) && isStr(d.html) && d.html.length <= 100_000 && (d.original === null || (isStr(d.original) && d.original.length <= 100_000))
        ? { ns: BB_NS, t: "region", region: d.region, html: d.html, original: d.original as string | null }
        : null;
    case "navigate":
      return isStr(d.href) && d.href.length <= 2000 ? { ns: BB_NS, t: "navigate", href: d.href } : null;
    case "height":
      return isNum(d.px) && d.px >= 0 && d.px <= 200_000 ? { ns: BB_NS, t: "height", px: d.px } : null;
    case "error":
      return isStr(d.message) && d.message.length <= 1000 ? { ns: BB_NS, t: "error", message: d.message } : null;
    default:
      return null;
  }
}

/** validate a message ARRIVING FROM the shell (used by the canvas runtime) */
export function parseShellMsg(data: unknown): ShellMsg | null {
  const d = base(data);
  if (!d) return null;
  switch (d.t) {
    case "init":
      return Array.isArray(d.metas) && d.metas.every(isEntryMeta) && isStrArray(d.order) && d.order.every(isEntryId)
        ? { ns: BB_NS, t: "init", metas: d.metas, order: d.order }
        : null;
    case "meta":
      return Array.isArray(d.metas) && d.metas.every(isEntryMeta) ? { ns: BB_NS, t: "meta", metas: d.metas } : null;
    case "order":
      return isStrArray(d.ids) && d.ids.every(isEntryId) ? { ns: BB_NS, t: "order", ids: d.ids } : null;
    case "hidden":
      return isEntryId(d.id) && isBool(d.hidden) ? { ns: BB_NS, t: "hidden", id: d.id, hidden: d.hidden } : null;
    case "replace":
      return isEntryId(d.id) && isStr(d.html) && d.html.length <= 2_000_000 ? { ns: BB_NS, t: "replace", id: d.id, html: d.html } : null;
    case "insert":
      return isNum(d.index) && d.index >= 0 && isStr(d.html) && d.html.length <= 2_000_000 && isEntryMeta(d.meta)
        ? { ns: BB_NS, t: "insert", index: Math.floor(d.index), html: d.html, meta: d.meta }
        : null;
    case "remove":
      return isEntryId(d.id) ? { ns: BB_NS, t: "remove", id: d.id } : null;
    case "select":
      return d.id === null || isEntryId(d.id) ? { ns: BB_NS, t: "select", id: d.id as string | null } : null;
    case "scrollTo":
      return isEntryId(d.id) ? { ns: BB_NS, t: "scrollTo", id: d.id } : null;
    case "field":
      return isEntryId(d.id) && isStr(d.field) && d.field.length <= 40 && isStr(d.value) && d.value.length <= 2000
        ? { ns: BB_NS, t: "field", id: d.id, field: d.field, value: d.value }
        : null;
    case "regionHtml":
      return isStr(d.region) && /^[a-z0-9-]{1,40}$/.test(d.region) && isStr(d.html) && d.html.length <= 100_000
        ? { ns: BB_NS, t: "regionHtml", region: d.region, html: d.html }
        : null;
    case "overlays":
      return isBool(d.on) ? { ns: BB_NS, t: "overlays", on: d.on } : null;
    default:
      return null;
  }
}

/* ------------------------------------------------ canvas error states */
/** every visible failure mode the CanvasFrame can be in — pure so the
    transition rules are testable */
export type CanvasStatus =
  | { s: "loading" }
  | { s: "ready" }
  | { s: "error"; code: CanvasErrorCode; detail?: string };

export type CanvasErrorCode =
  | "auth" // preview authentication failed (signed out / not admin)
  | "route" // route unavailable (404 / unknown)
  | "draft" // draft failed to load
  | "bridge" // builder bridge never connected / disconnected
  | "render"; // canvas reported a rendering error

export const CANVAS_ERROR_TEXT: Record<CanvasErrorCode, string> = {
  auth: "Preview authentication failed — your admin session may have expired. Sign in again, then retry.",
  route: "This route is unavailable — it may not exist or is not previewable.",
  draft: "The draft failed to load for this page.",
  bridge: "The builder lost contact with the page canvas.",
  render: "The page hit a rendering error inside the canvas.",
};

/** shell-side status transitions: what a load-cycle event does to state */
export function canvasStatusNext(
  prev: CanvasStatus,
  ev:
    | { kind: "load-start" }
    | { kind: "preflight"; httpStatus: number }
    | { kind: "bridge-ready" }
    | { kind: "bridge-error"; message: string }
    | { kind: "timeout" }
    | { kind: "disconnected" }
): CanvasStatus {
  switch (ev.kind) {
    case "load-start":
      return { s: "loading" };
    case "preflight":
      if (ev.httpStatus === 404) return { s: "error", code: "auth" };
      if (ev.httpStatus === 400) return { s: "error", code: "route" };
      if (ev.httpStatus >= 500) return { s: "error", code: "draft", detail: `HTTP ${ev.httpStatus}` };
      return prev.s === "loading" ? prev : { s: "loading" };
    case "bridge-ready":
      return { s: "ready" };
    case "bridge-error":
      return { s: "error", code: "render", detail: ev.message };
    case "timeout":
      // only a pending load times out — a ready canvas stays ready
      return prev.s === "loading" ? { s: "error", code: "bridge" } : prev;
    case "disconnected":
      return prev.s === "ready" ? { s: "error", code: "bridge" } : prev;
  }
}
