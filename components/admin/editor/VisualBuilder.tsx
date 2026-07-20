"use client";
/* Visual Builder — the full-fidelity page workspace on the 0018/0019 rails.

   Center      : CanvasFrame — the REAL page in a same-origin Draft-Mode
                 iframe. Click a visible section to select it, double-click
                 text to edit in place, drag the handle to reorder, use the
                 + buttons to insert blocks. Changes appear immediately.
   Top toolbar : page selector · device widths (1440/768/390) · zoom ·
                 undo/redo · reload · Preview (new tab) · Save Draft ·
                 Publish (diff + typed template confirm) · History ·
                 Page Settings · New Page · Exit
   Left panel  : Pages · Blocks · Layers (synced selection + reorder)
   Right panel : settings for the selected section/block

   Nothing here touches a public page: Save Draft persists through the
   sanitizing draft API, Publish runs the atomic RPCs, and the server
   re-validates every document independently of this UI. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Save,
  CloudUpload,
  History as HistoryIcon,
  Settings2,
  Plus,
  RefreshCw,
  ExternalLink,
  LogOut,
  Eye,
  EyeOff,
  Trash2,
  GripVertical,
  Lock,
  ClipboardPaste,
} from "lucide-react";
import { generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TipTapLink from "@tiptap/extension-link";
import {
  BLOCK_DEFS,
  BLOCK_DEF_BY_TYPE,
  TEMPLATE_SECTIONS,
  SYSTEM_NAV,
  codeLayout,
  diffLayouts,
  EDITORS_PICKS_DEFAULT,
  TREATMENTS,
  WIDTHS,
  ALIGNS,
  SPACINGS,
  VISIBILITIES,
  isAllowedCtaAction,
  type HoodCtaSettings,
  type LayoutDoc,
  type LayoutEntry,
  type BlockInstance,
  type SectionDef,
  type NavItem,
  type BlockButton,
  type BlockImage,
} from "@/lib/editor/blocks.ts";
import { BB_NS, type CanvasEntryMeta, type CanvasMsg } from "@/lib/editor/bridge-protocol";
import { INTENTS, INTENT_KEYS, type IntentKey } from "@/lib/convert/intents";
import { cities, bySlug } from "@/lib/dfw-data";
import RichEditor, { type RichEditorHandle } from "./RichEditor";
import { MediaPicker, type MediaItem } from "./EditorDesk";
import CanvasFrame, { type CanvasApi } from "./CanvasFrame";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";

/* ------------------------------------------------------------ utilities */
let uidCounter = 0;
const uid = () => `blk-${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const newBlock = (type: string): BlockInstance => ({
  id: uid(),
  type,
  hidden: false,
  visibility: "all",
  style: { treatment: "parchment", width: "constrained", align: "left", spacing: "md" },
  settings:
    type === "hero"
      ? { kicker: "", heading: "New headline", sub: "", level: "h2", buttons: [] }
      : type === "richtext"
        ? { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write here…" }] }] } }
        : type === "cta"
          ? { kicker: "", heading: "Ready when you are.", body: "", buttons: [{ label: "Search homes", href: "/homes", style: "primary" }] }
          : type === "quote"
            ? { text: "A line worth quoting.", cite: "" }
            : type === "faq"
              ? { items: [{ q: "A good question?", a: "A straight answer." }] }
              : type === "featureGrid"
                ? { items: [{ title: "First feature", note: "Why it matters." }], columns: "3" }
                : type === "statsBand"
                  ? { items: [{ value: "90", label: "city reports" }], note: "" }
                  : type === "searchPromo"
                    ? { heading: "Search the market", body: "", target: "/homes", buttonLabel: "Open the search" }
                    : type === "leadForm"
                      ? { heading: "Talk to a local guide", primary: "ask-a-question" }
                      : type === "featuredListings"
                        ? { heading: "Fresh on the market", citySlug: "", maxPrice: "", count: "3", newBuildsOnly: false }
                        : type === "marketSnapshot" || type === "nearbyAreas"
                          ? { citySlug: "frisco", count: "3" }
                          : type === "spacer"
                            ? { size: "md" }
                            : type === "divider"
                              ? { line: "rule" }
                              : type === "gallery"
                                ? { images: [], columns: "3" }
                                : type === "imageText"
                                  ? { image: null, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write here…" }] }] }, imageSide: "left" }
                                  : type === "image" || type === "editorialPhoto"
                                    ? { image: null, placement: "full" }
                                    : {},
});

const entryId = (e: LayoutEntry) => (e.kind === "section" ? `s:${e.key}` : `b:${e.block.id}`);

/* individual hood/community routes edit against the shared hood template's
   section contract — but as PAGE-SPECIFIC (this page only) documents */
const HOOD_ROUTE_RE = /^\/city\/[a-z0-9-]+\/[a-z0-9-]+$/;
const sectionsKeyFor = (route: string): string => (TEMPLATE_SECTIONS[route] ? route : HOOD_ROUTE_RE.test(route) ? "template:hood" : route);
const stableStr = (v: unknown) => JSON.stringify(v);

/* --------------------------------------------------- editor's picks */
const PICKS_ID = "s:picks";
export type PickCard = { city: string; tagline?: string };
export interface PickPhotoAsset {
  public_image_url: string;
  alt_text: string;
  caption: string | null;
  attribution_text: string;
  license: string;
  source_page_url: string | null;
  approved_by: string;
  approved_at: string;
  width: number | null;
  height: number | null;
}

/** one community gallery slot's Photo Desk state (A3 — read-only here) */
export interface GallerySlotInfo {
  slotKey: string;
  slot: { id: string; status: string; label: string } | null;
  asset: PickPhotoAsset | null;
  pendingCandidates: number;
}

export interface PickPhotoInfo {
  city: string;
  cityName: string;
  slot: { id: string; status: string; label: string } | null;
  asset: PickPhotoAsset | null;
  pendingCandidates: number;
  /** present for entity=neighborhood: the community gallery slots */
  gallery?: GallerySlotInfo[];
}

const defaultPicks = (): PickCard[] => EDITORS_PICKS_DEFAULT.map((c) => ({ city: c }));
const isDefaultPicks = (p: PickCard[]) => p.length === 4 && p.every((x, i) => x.city === EDITORS_PICKS_DEFAULT[i] && !x.tagline);
const picksOf = (list: LayoutEntry[]): PickCard[] => {
  for (const e of list) if (e.kind === "section" && e.key === "picks") return e.settings?.picks ?? defaultPicks();
  return defaultPicks();
};

/** HTML → sanitized-format TipTap document (the server re-sanitizes on save) */
const TT_EXTENSIONS = [StarterKit, TipTapLink];
const htmlToDoc = (html: string): unknown => {
  try {
    return generateJSON(html, TT_EXTENSIONS);
  } catch {
    return null;
  }
};

interface Target {
  route: string;
  title: string;
  group: "Pages" | "Templates" | "Site" | "My pages";
  kind: "static" | "template" | "custom" | "nav";
  previewRoute?: string;
}

const BASE_TARGETS: Target[] = [
  { route: "/", title: "Homepage", group: "Pages", kind: "static", previewRoute: "/" },
  { route: "/land", title: "Land for Sale", group: "Pages", kind: "static", previewRoute: "/land" },
  { route: "/new-builds", title: "New Construction", group: "Pages", kind: "static", previewRoute: "/new-builds" },
  { route: "/how-we-research", title: "How We Research", group: "Pages", kind: "static", previewRoute: "/how-we-research" },
  { route: "template:city", title: "City template (ALL 90 cities)", group: "Templates", kind: "template", previewRoute: "/city/frisco" },
  { route: "template:hood", title: "Hood template (ALL communities)", group: "Templates", kind: "template", previewRoute: "/city/northlake/pecan-square" },
  { route: "__site", title: "Site navigation", group: "Site", kind: "nav" },
];

const PAGE_TEMPLATES = [
  { key: "blank", label: "Blank Editorial Page" },
  { key: "landing", label: "Landing Page" },
  { key: "buyer-guide", label: "Buyer Guide" },
  { key: "seller-guide", label: "Seller Guide" },
  { key: "about-team", label: "About / Team Page" },
  { key: "contact", label: "Contact Page" },
  { key: "listings-landing", label: "Listings Landing Page" },
];

const DEVICES = [
  { key: "desktop", label: "Desktop", width: 1440 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "mobile", label: "Mobile", width: 390 },
] as const;

const ZOOMS: { key: "fit" | number; label: string }[] = [
  { key: "fit", label: "FIT" },
  { key: 1, label: "100%" },
  { key: 0.75, label: "75%" },
  { key: 0.5, label: "50%" },
];

/** inline-editable text fields per block type (mirrors data-bb-field markers) */
const INLINE_FIELDS: Record<string, { field: string; kind: "plain" | "rich" }[]> = {
  hero: [
    { field: "heading", kind: "plain" },
    { field: "sub", kind: "plain" },
  ],
  cta: [
    { field: "heading", kind: "plain" },
    { field: "body", kind: "plain" },
  ],
  quote: [{ field: "text", kind: "plain" }],
  searchPromo: [
    { field: "heading", kind: "plain" },
    { field: "body", kind: "plain" },
  ],
  richtext: [{ field: "doc", kind: "rich" }],
  imageText: [{ field: "doc", kind: "rich" }],
};

const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `2px solid ${danger ? ORANGE_DARK : INK}`,
  borderRadius: 999,
  padding: "9px 15px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".07em",
  cursor: "pointer",
  background: primary ? ORANGE : danger ? "transparent" : CARD,
  color: primary ? CREAM : danger ? ORANGE_DARK : INK,
  whiteSpace: "nowrap",
});

const iconBtn = (active = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `2px solid ${INK}`,
  borderRadius: 9,
  width: 34,
  height: 34,
  cursor: "pointer",
  background: active ? INK : CARD,
  color: active ? CREAM : INK,
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1.5px solid ${INK}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#fff",
  color: INK,
};

const selStyle: React.CSSProperties = { ...inputStyle, padding: "7px 8px" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 10 }}>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "rgba(29,25,19,.6)" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

/* ============================================================== builder */
export default function VisualBuilder({
  adminEmail,
  initialTarget,
  embedded,
}: {
  adminEmail: string;
  /** Community Studio embed: open ONE page, hide global navigation chrome.
      `draftCommunity` marks a not-yet-exported draft route: layout/text
      documents SAVE normally (keyed to the future canonical route) but
      PUBLISH stays locked until the page is exported, reviewed, deployed,
      and verified live. */
  initialTarget?: { route: string; title: string; draftCommunity?: boolean };
  embedded?: boolean;
}) {
  void adminEmail;
  const draftCommunity = !!(embedded && initialTarget?.draftCommunity);
  const [customPages, setCustomPages] = useState<{ slug: string; title: string; status: string; template: string; seo_title: string | null; seo_description: string | null; og_image_url: string | null; nav_label: string | null; show_in_nav: boolean; header_footer: boolean }[]>([]);
  const [migrationApplied, setMigrationApplied] = useState<boolean | null>(null);
  const [target, setTarget] = useState<Target>(
    initialTarget
      ? { route: initialTarget.route, title: initialTarget.title, group: "Pages", kind: "static", previewRoute: initialTarget.route }
      : BASE_TARGETS[0]
  );
  const [entries, setEntries] = useState<LayoutEntry[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [publishedDoc, setPublishedDoc] = useState<LayoutDoc | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<{ versionNo: number; status: string; createdAt: string; createdBy: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [leftTab, setLeftTab] = useState<"pages" | "blocks" | "layers">(embedded ? "layers" : "pages");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [mediaFor, setMediaFor] = useState<{ blockId: string; field: string; index?: number } | null>(null);
  const [mediaLists, setMediaLists] = useState<{ media: MediaItem[]; assets: MediaItem[] } | null>(null);
  const [clipboard, setClipboard] = useState<BlockInstance | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [previewCity, setPreviewCity] = useState("frisco");
  const [regionDrafts, setRegionDrafts] = useState<Record<string, { html: string; doc: unknown }>>({});
  /* hood tagline — a TEXT-typed region, edited from the panel only (an
     inline rich commit would corrupt its {value} document shape) */
  const [taglineDraft, setTaglineDraft] = useState<string | null>(null);
  const taglineDraftRef = useRef(taglineDraft);
  taglineDraftRef.current = taglineDraft;
  /* cta-override / tagline edits don't live-update the canvas — reload it
     once after the save that persists them */
  const ctaTouchedRef = useRef(false);
  /* editor's picks card editing */
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const selectedCardRef = useRef<number | null>(null);
  selectedCardRef.current = selectedCard;
  const [photoModalCity, setPhotoModalCity] = useState<string | null>(null);
  const [pickPhotos, setPickPhotos] = useState<Record<string, PickPhotoInfo | null>>({});
  const [missingPhotos, setMissingPhotos] = useState<string[]>([]);
  const lastPicksRef = useRef<string>("");

  /* ------------------------------------------------- canvas plumbing */
  const canvasApi = useRef<CanvasApi | null>(null);
  const entriesRef = useRef<LayoutEntry[]>(entries);
  entriesRef.current = entries;
  const targetRef = useRef(target);
  targetRef.current = target;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const canvasSt = useRef<{ ready: boolean; order: string[]; hidden: Record<string, boolean>; blockJson: Record<string, string> }>({ ready: false, order: [], hidden: {}, blockJson: {} });
  const regionsCanvas = useRef<Record<string, string>>({});
  const regionsOriginal = useRef<Record<string, string>>({});
  const regionDraftsRef = useRef(regionDrafts);
  regionDraftsRef.current = regionDrafts;
  const savedRegionsRef = useRef<Record<string, number>>({});
  const htmlCache = useRef<Map<string, string | null>>(new Map());
  const syncBusy = useRef(false);
  const syncAgain = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** the real public path the canvas renders for the current target */
  const canvasRoute =
    target.kind === "template"
      ? target.route === "template:city"
        ? `/city/${previewCity}`
        : (target.previewRoute ?? "/city/northlake/pecan-square")
      : (target.previewRoute ?? target.route);

  const sections: SectionDef[] = useMemo(() => TEMPLATE_SECTIONS[sectionsKeyFor(target.route)] ?? [], [target.route]);
  const sectionByKey = useMemo(() => new Map(sections.map((s) => [s.key, s])), [sections]);
  const sectionByKeyRef = useRef(sectionByKey);
  sectionByKeyRef.current = sectionByKey;

  const metaFor = useCallback(
    (e: LayoutEntry): CanvasEntryMeta => {
      if (e.kind === "section") {
        const def = sectionByKey.get(e.key);
        const lockish = !!(def?.locked || def?.required);
        return {
          id: `s:${e.key}`,
          label: def?.label ?? e.key,
          kind: "section",
          locked: !!def?.locked,
          required: !!def?.required,
          hideable: !lockish,
          deletable: false,
          movable: true,
          hidden: e.hidden,
          fields: [],
          regions: [],
        };
      }
      const def = BLOCK_DEF_BY_TYPE.get(e.block.type);
      const pinnedHero = target.kind === "custom" && e.block.type === "hero" && String(e.block.settings.level ?? "h1") === "h1";
      return {
        id: `b:${e.block.id}`,
        label: def?.label ?? e.block.type,
        kind: "block",
        locked: !!def?.protectedBlock,
        required: false,
        hideable: true,
        deletable: true,
        movable: !pinnedHero,
        hidden: e.block.hidden,
        fields: INLINE_FIELDS[e.block.type] ?? [],
        regions: [],
      };
    },
    [sectionByKey, target.kind]
  );

  /* ------------------------------------------------------------ history */
  const historyRef = useRef<{ stack: { entries: LayoutEntry[]; regions: Record<string, string> }[]; idx: number }>({ stack: [], idx: -1 });
  const pushHistory = useCallback((next: LayoutEntry[]) => {
    const h = historyRef.current;
    const snap = { entries: next, regions: { ...regionsCanvas.current } };
    // idempotent: a re-delivered event or double-invoked handler must not
    // mint a second identical entry (it would make undo a visible no-op)
    const cur = h.stack[h.idx];
    if (cur && stableStr(cur.entries) === stableStr(snap.entries) && stableStr(cur.regions) === stableStr(snap.regions)) return;
    h.stack = h.stack.slice(0, h.idx + 1).concat([snap]).slice(-50);
    h.idx = h.stack.length - 1;
  }, []);
  const setLayout = useCallback(
    (next: LayoutEntry[]) => {
      setEntries(next);
      pushHistory(next);
      setDirty(true);
    },
    [pushHistory]
  );

  /** apply a history snapshot's region text back to the canvas + drafts */
  const applyRegionSnapshot = useCallback((snap: Record<string, string>) => {
    const keys = new Set([...Object.keys(snap), ...Object.keys(regionsCanvas.current)]);
    const nextDrafts: Record<string, { html: string; doc: unknown }> = {};
    for (const key of keys) {
      const targetHtml = snap[key] ?? regionsOriginal.current[key];
      if (targetHtml === undefined) continue;
      if (regionsCanvas.current[key] !== targetHtml) {
        canvasApi.current?.send({ ns: BB_NS, t: "regionHtml", region: key, html: targetHtml });
        regionsCanvas.current[key] = targetHtml;
      }
      if (targetHtml !== regionsOriginal.current[key]) {
        const doc = htmlToDoc(targetHtml);
        if (doc) nextDrafts[key] = { html: targetHtml, doc };
      }
    }
    setRegionDrafts(nextDrafts);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx > 0) {
      h.idx -= 1;
      setEntries(h.stack[h.idx].entries);
      applyRegionSnapshot(h.stack[h.idx].regions);
      setDirty(true);
    }
  }, [applyRegionSnapshot]);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx < h.stack.length - 1) {
      h.idx += 1;
      setEntries(h.stack[h.idx].entries);
      applyRegionSnapshot(h.stack[h.idx].regions);
      setDirty(true);
    }
  }, [applyRegionSnapshot]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  /* ------------------------------------------------------------- loads */
  const loadCustomPages = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/editor/site-pages");
      const j = await res.json();
      setMigrationApplied(j.migrationApplied !== false);
      setCustomPages(j.pages ?? []);
    } catch {
      setMigrationApplied(false);
    }
  }, []);
  useEffect(() => {
    loadCustomPages();
  }, [loadCustomPages]);

  const loadTarget = useCallback(async (t: Target) => {
    setBusy("load");
    setMessage(null);
    setSelectedId(null);
    setSelectedCard(null);
    setPhotoModalCity(null);
    setMissingPhotos([]);
    lastPicksRef.current = "";
    setRegionDrafts({});
    setTaglineDraft(null);
    ctaTouchedRef.current = false;
    regionsCanvas.current = {};
    regionsOriginal.current = {};
    savedRegionsRef.current = {};
    canvasSt.current = { ready: false, order: [], hidden: {}, blockJson: {} };
    try {
      const region = t.kind === "nav" ? "nav" : "__layout";
      const res = await fetch(`/api/admin/editor/doc?route=${encodeURIComponent(t.route)}&region=${region}`);
      const j = await res.json();
      const draft = j.draft?.content_json as LayoutDoc | { type: "nav"; items: NavItem[] } | undefined;
      const published = j.published?.content_json as LayoutDoc | { type: "nav"; items: NavItem[] } | undefined;
      setBaseVersion(j.baseVersion ?? 0);
      setDraftVersion(j.draft?.version_no ?? null);
      setVersions(j.versions ?? []);
      if (t.kind === "nav") {
        const items = ((draft ?? published) as { items?: NavItem[] } | undefined)?.items;
        setNavItems(
          items?.length
            ? items
            : SYSTEM_NAV.map((s) => ({ key: s.key, label: s.label, href: s.href, kind: "system" as const, hidden: false }))
        );
        setPublishedDoc(null);
        setEntries([]);
      } else {
        const working = (draft as LayoutDoc | undefined) ?? (published as LayoutDoc | undefined) ?? codeLayout(sectionsKeyFor(t.route));
        setEntries(working.blocks);
        setPublishedDoc((published as LayoutDoc | undefined) ?? null);
        historyRef.current = { stack: [{ entries: working.blocks, regions: {} }], idx: 0 };
      }
      setDirty(false);
    } catch {
      setMessage({ kind: "error", text: "Failed to load this page — try again." });
    } finally {
      setBusy(null);
    }
  }, []);
  useEffect(() => {
    loadTarget(target);
  }, [target, loadTarget]);

  // unsaved-changes guard
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const switchTarget = (t: Target) => {
    if (dirty && !window.confirm("You have unsaved changes — discard them?")) return;
    setTarget(t);
  };

  /* ------------------------------------------------------------ actions */
  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }

  const workingDoc = (): unknown =>
    target.kind === "nav" ? { type: "nav", items: navItems } : ({ type: "layout", blocks: entries } satisfies LayoutDoc);

  const saveDraft = useCallback(async () => {
    setBusy("save");
    setMessage(null);
    try {
      const j = await post("/api/admin/editor/draft", {
        route: target.route,
        regionKey: target.kind === "nav" ? "nav" : "__layout",
        content: workingDoc(),
        baseVersion,
      });
      if (!j.ok) {
        setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Save failed" });
        return;
      }
      setBaseVersion(j.versionNo);
      setDraftVersion(j.versionNo);
      // in-canvas text edits ride the SAME save: one region draft per edited
      // region, each through the 0018 sanitizer
      const notes: string[] = [`layout v${j.versionNo}`];
      let allOk = true;
      for (const [key, d] of Object.entries(regionDraftsRef.current)) {
        try {
          const dj = await (await fetch(`/api/admin/editor/doc?route=${encodeURIComponent(target.route)}&region=${encodeURIComponent(key)}`)).json();
          const rj = await post("/api/admin/editor/draft", {
            route: target.route,
            regionKey: key,
            content: d.doc,
            baseVersion: dj.baseVersion ?? 0,
          });
          if (rj.ok) {
            savedRegionsRef.current[key] = rj.versionNo;
            notes.push(`“${key}” text v${rj.versionNo}`);
          } else {
            allOk = false;
            notes.push(`“${key}” FAILED: ${((rj.errors as string[]) ?? [rj.error]).filter(Boolean).join(", ")}`);
          }
        } catch {
          allOk = false;
          notes.push(`“${key}” FAILED: network error`);
        }
      }
      // the panel-edited hood tagline rides the same save — {value} shape,
      // 0018 text sanitizer, same audited versioning as every region
      const tl = taglineDraftRef.current;
      if (tl !== null && HOOD_ROUTE_RE.test(target.route)) {
        const v = tl.trim();
        if (!v) {
          allOk = false;
          notes.push("tagline SKIPPED: empty — to remove an override, use Restore fallback on the CONTENT desk");
        } else {
          try {
            const dj = await (await fetch(`/api/admin/editor/doc?route=${encodeURIComponent(target.route)}&region=tagline`)).json();
            const rj = await post("/api/admin/editor/draft", {
              route: target.route,
              regionKey: "tagline",
              content: { value: v },
              baseVersion: dj.baseVersion ?? 0,
            });
            if (rj.ok) {
              savedRegionsRef.current["tagline"] = rj.versionNo;
              notes.push(`tagline v${rj.versionNo}`);
              setTaglineDraft(null);
              ctaTouchedRef.current = true;
            } else {
              allOk = false;
              notes.push(`tagline FAILED: ${((rj.errors as string[]) ?? [rj.error]).filter(Boolean).join(", ")}`);
            }
          } catch {
            allOk = false;
            notes.push("tagline FAILED: network error");
          }
        }
      }
      setMessage({ kind: allOk ? "ok" : "error", text: `Draft saved — ${notes.join(" · ")}` });
      if (allOk) setDirty(false);
      // CTA-override / tagline changes render server-side — one reload shows them
      if (ctaTouchedRef.current) {
        ctaTouchedRef.current = false;
        canvasApi.current?.reload();
      }
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, entries, navItems, baseVersion]);

  const publish = useCallback(async () => {
    if (draftVersion == null) return;
    setBusy("publish");
    try {
      const j = await post("/api/admin/editor/publish", {
        route: target.route,
        regionKey: target.kind === "nav" ? "nav" : "__layout",
        versionNo: draftVersion,
        confirmText: target.kind === "template" ? confirmText : undefined,
      });
      if (!j.ok) {
        setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Publish failed" });
        return;
      }
      // saved in-canvas text drafts publish with the layout — one audited
      // publish per region document, honestly reported one by one
      const notes: string[] = [String(j.note ?? "Layout published")];
      let warn = !j.revalidated;
      for (const [key, v] of Object.entries(savedRegionsRef.current)) {
        const rj = await post("/api/admin/editor/publish", { route: target.route, regionKey: key, versionNo: v });
        if (rj.ok) notes.push(`“${key}” text published`);
        else {
          warn = true;
          notes.push(`“${key}” text publish FAILED: ${((rj.errors as string[]) ?? [rj.error]).filter(Boolean).join(", ")}`);
        }
      }
      savedRegionsRef.current = {};
      setRegionDrafts({});
      setPublishOpen(false);
      setConfirmText("");
      setMessage({ kind: warn ? "warn" : "ok", text: notes.join(" · ") });
      await Promise.all([loadTarget(target), loadCustomPages()]);
      canvasApi.current?.reload();
    } finally {
      setBusy(null);
    }
  }, [target, draftVersion, confirmText, loadTarget, loadCustomPages]);

  /* -------------------------------------------------- entry operations */
  const selected = entries.find((e) => entryId(e) === selectedId) ?? null;
  const selectedBlock = selected?.kind === "block" ? selected.block : null;
  const selectedSection = selected?.kind === "section" ? sectionByKey.get(selected.key) : null;

  const updateEntry = (id: string, fn: (e: LayoutEntry) => LayoutEntry) => setLayout(entries.map((e) => (entryId(e) === id ? fn(e) : e)));
  const updateBlock = (id: string, patch: Partial<BlockInstance>) =>
    updateEntry(`b:${id}`, (e) => (e.kind === "block" ? { ...e, block: { ...e.block, ...patch } } : e));
  const updateSettings = (id: string, patch: Record<string, unknown>) =>
    updateEntry(`b:${id}`, (e) => (e.kind === "block" ? { ...e, block: { ...e.block, settings: { ...e.block.settings, ...patch } } } : e));

  /* --------------------------------------------- editor's picks state */
  const setPicks = (next: PickCard[]) => {
    setLayout(
      entriesRef.current.map((e) => {
        if (e.kind !== "section" || e.key !== "picks") return e;
        const { settings: _drop, ...rest } = e;
        void _drop;
        // the code lineup stores NO override — identity drafts stay clean
        return isDefaultPicks(next) ? rest : { ...rest, settings: { picks: next } };
      })
    );
  };

  const loadPickInfo = useCallback(async (city: string, force = false) => {
    if (!force) {
      let known = false;
      setPickPhotos((prev) => {
        known = city in prev;
        return known ? prev : { ...prev, [city]: null };
      });
      if (known) return;
    }
    try {
      const j = await (await fetch(`/api/admin/editor/pick-photos?city=${encodeURIComponent(city)}`)).json();
      if (j.ok) setPickPhotos((prev) => ({ ...prev, [city]: j as PickPhotoInfo }));
    } catch {
      /* stays in loading state — the panel shows a retry-friendly message */
    }
  }, []);

  const addBlockAt = (type: string, index: number | null) => {
    const b: LayoutEntry = { kind: "block", block: newBlock(type) };
    const idx = index ?? (selected ? entries.findIndex((e) => entryId(e) === selectedId) + 1 : entries.length);
    const next = [...entries];
    next.splice(idx, 0, b);
    setLayout(next);
    setSelectedId(entryId(b));
  };

  const pasteAt = (index: number | null) => {
    if (!clipboard) return;
    const copy: LayoutEntry = { kind: "block", block: { ...structuredClone(clipboard), id: uid() } };
    const next = [...entries];
    next.splice(index ?? entries.length, 0, copy);
    setLayout(next);
    setSelectedId(entryId(copy));
  };

  const duplicate = (id: string) => {
    const idx = entries.findIndex((e) => entryId(e) === id);
    const e = entries[idx];
    if (e?.kind !== "block") return;
    const copy: LayoutEntry = { kind: "block", block: { ...structuredClone(e.block), id: uid() } };
    const next = [...entries];
    next.splice(idx + 1, 0, copy);
    setLayout(next);
    setSelectedId(entryId(copy));
  };
  const removeEntry = (id: string) => {
    const e = entries.find((x) => entryId(x) === id);
    if (!e || e.kind === "section") return; // sections are never deletable — hide only
    setLayout(entries.filter((x) => entryId(x) !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const toggleHidden = (id: string) => {
    const e = entries.find((x) => entryId(x) === id);
    if (!e) return;
    if (e.kind === "section") {
      const def = sectionByKey.get(e.key);
      if (def?.required || def?.locked) return;
      updateEntry(id, (x) => (x.kind === "section" ? { ...x, hidden: !x.hidden } : x));
    } else {
      updateBlock(e.block.id, { hidden: !e.block.hidden });
    }
  };

  const onLayerDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((e) => entryId(e) === active.id);
    const to = entries.findIndex((e) => entryId(e) === over.id);
    if (from < 0 || to < 0) return;
    setLayout(arrayMove(entries, from, to));
  };

  /* --------------------------------------------------- canvas sync */
  const placeholderHtml = (b: BlockInstance) => {
    const label = (BLOCK_DEF_BY_TYPE.get(b.type)?.label ?? b.type).toUpperCase();
    return `<section style="background:#F6F1E6;border-top:2px dashed rgba(29,25,19,.45);border-bottom:2px dashed rgba(29,25,19,.45)"><div style="max-width:1280px;margin:0 auto;padding:44px 4vw;font-family:ui-monospace,monospace;font-size:12px;font-weight:700;letter-spacing:.12em;color:rgba(29,25,19,.6)">${label} — THIS BLOCK'S LIVE COMPONENT RENDERS AFTER SAVE DRAFT (reload the canvas)</div></section>`;
  };

  const fetchBlockHtml = useCallback(
    async (b: BlockInstance): Promise<string> => {
      const key = stableStr(b);
      const cached = htmlCache.current.get(key);
      if (cached !== undefined) return cached ?? placeholderHtml(b);
      try {
        const j = await post("/api/admin/editor/render-block", {
          route: target.route,
          block: b,
          citySlug: target.route === "template:city" ? previewCity : undefined,
        });
        const html: string | null = j.ok && j.html ? j.html : null;
        if (htmlCache.current.size > 120) htmlCache.current.clear();
        htmlCache.current.set(key, html);
        return html ?? placeholderHtml(b);
      } catch {
        return placeholderHtml(b);
      }
    },
    [target.route, previewCity]
  );

  /** make the canvas match the working entries — order, hidden flags, and
      re-rendered blocks. Runs to convergence; restarts if state moves. */
  const syncCanvas = useCallback(async () => {
    const api = canvasApi.current;
    const c = canvasSt.current;
    if (!api || !c.ready) return;
    if (syncBusy.current) {
      syncAgain.current = true;
      return;
    }
    syncBusy.current = true;
    try {
      for (let pass = 0; pass < 6; pass++) {
        syncAgain.current = false;
        const list = entriesRef.current;
        const desired = list.map(entryId);
        // removals first
        for (const id of [...c.order]) {
          if (!desired.includes(id)) {
            api.send({ ns: BB_NS, t: "remove", id });
            c.order = c.order.filter((x) => x !== id);
            delete c.hidden[id];
            delete c.blockJson[id];
          }
        }
        let moved = false;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          const id = desired[i];
          const hid = e.kind === "section" ? e.hidden : e.block.hidden;
          if (!c.order.includes(id)) {
            if (e.kind !== "block") continue; // sections always exist in the frame
            const html = await fetchBlockHtml(e.block);
            if (entriesRef.current !== list) {
              moved = true;
              break;
            }
            const before = desired.slice(0, i).filter((x) => c.order.includes(x));
            const idx = before.length ? c.order.indexOf(before[before.length - 1]) + 1 : 0;
            api.send({ ns: BB_NS, t: "insert", index: idx, html, meta: metaFor(e) });
            c.order.splice(idx, 0, id);
            c.hidden[id] = false;
            c.blockJson[id] = stableStr(e.block);
            if (hid) {
              api.send({ ns: BB_NS, t: "hidden", id, hidden: true });
              c.hidden[id] = true;
            }
          } else {
            if ((c.hidden[id] ?? false) !== hid) {
              api.send({ ns: BB_NS, t: "hidden", id, hidden: hid });
              c.hidden[id] = hid;
            }
            if (e.kind === "block") {
              const jj = stableStr(e.block);
              if (c.blockJson[id] !== jj) {
                const html = await fetchBlockHtml(e.block);
                if (entriesRef.current !== list) {
                  moved = true;
                  break;
                }
                api.send({ ns: BB_NS, t: "replace", id, html });
                c.blockJson[id] = jj;
              }
            }
          }
        }
        if (moved) continue;
        const orderNow = desired.filter((id) => c.order.includes(id));
        if (stableStr(orderNow) !== stableStr(c.order)) {
          api.send({ ns: BB_NS, t: "order", ids: orderNow });
          c.order = orderNow;
        }
        api.send({ ns: BB_NS, t: "meta", metas: entriesRef.current.map(metaFor) });
        if (!syncAgain.current) break;
      }
    } finally {
      syncBusy.current = false;
    }
  }, [fetchBlockHtml, metaFor]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      void syncCanvas();
    }, 250);
  }, [syncCanvas]);

  useEffect(() => {
    scheduleSync();
  }, [entries, scheduleSync]);

  /* picks changed → re-render the REAL section into the canvas (debounced;
     the response also reports cities without an approved pick photo) */
  useEffect(() => {
    if (target.route !== "/") return;
    const cur = stableStr(picksOf(entries));
    if (!canvasSt.current.ready || lastPicksRef.current === "" || cur === lastPicksRef.current) return;
    const t = setTimeout(async () => {
      lastPicksRef.current = cur;
      const p = picksOf(entriesRef.current);
      const j = await post("/api/admin/editor/render-picks", { picks: isDefaultPicks(p) ? null : p });
      if (j.ok && j.html) {
        canvasApi.current?.send({ ns: BB_NS, t: "replace", id: PICKS_ID, html: j.html });
        setMissingPhotos((j.missingPhotos as string[]) ?? []);
        const sc = selectedCardRef.current;
        if (sc !== null) canvasApi.current?.send({ ns: BB_NS, t: "cardSelect", section: PICKS_ID, index: sc });
      } else if (!j.ok) {
        setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Pick update failed" });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, target.route]);

  /* the bridge (re)connected — seed canvas state, init overlays, resync */
  const onCanvasReady = useCallback(() => {
    const c = canvasSt.current;
    c.ready = true;
    c.hidden = {};
    c.blockJson = {};
    const clean = !dirtyRef.current;
    for (const e of entriesRef.current) {
      const id = entryId(e);
      if (!c.order.includes(id)) continue;
      c.hidden[id] = e.kind === "section" ? e.hidden : e.block.hidden;
      // a clean load renders exactly the working draft — skip re-renders;
      // a dirty reload can't be trusted, so every block re-renders
      if (clean && e.kind === "block") c.blockJson[id] = stableStr(e.block);
    }
    canvasApi.current?.send({ ns: BB_NS, t: "init", metas: entriesRef.current.map(metaFor), order: entriesRef.current.map(entryId) });
    if (selectedId) canvasApi.current?.send({ ns: BB_NS, t: "select", id: selectedId });
    // picks baseline: the frame just rendered THIS lineup; changes diff from here
    if (targetRef.current.route === "/") {
      lastPicksRef.current = stableStr(picksOf(entriesRef.current));
      const p0 = picksOf(entriesRef.current);
      if (!isDefaultPicks(p0)) {
        // populate the missing-photo report for an already-overridden draft
        void post("/api/admin/editor/render-picks", { picks: p0 }).then((j) => {
          if (j.ok) setMissingPhotos((j.missingPhotos as string[]) ?? []);
        });
      } else {
        setMissingPhotos([]);
      }
    }
    // unsaved in-canvas text edits survive a canvas reload
    regionsCanvas.current = {};
    for (const [key, d] of Object.entries(regionDraftsRef.current)) {
      canvasApi.current?.send({ ns: BB_NS, t: "regionHtml", region: key, html: d.html });
      regionsCanvas.current[key] = d.html;
    }
    void syncCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaFor, syncCanvas]);

  /* every message FROM the canvas (already schema-validated by the frame).
     IMPORTANT: this callback is memoized — it must never touch `entries`
     or helpers that close over it (stale first-render captures). Everything
     goes through entriesRef/sectionByKeyRef + the stable setLayout. */
  const onCanvasMsg = useCallback(
    (m: CanvasMsg) => {
      const c = canvasSt.current;
      const patchEntry = (id: string, fn: (e: LayoutEntry) => LayoutEntry) =>
        setLayout(entriesRef.current.map((e) => (entryId(e) === id ? fn(e) : e)));
      switch (m.t) {
        case "ready":
          c.order = m.ids; // actual DOM order in the frame
          break;
        case "select":
          setSelectedId(m.id);
          setSelectedCard(null);
          if (m.id) setLeftTab("layers");
          break;
        case "card":
          setSelectedId(m.section);
          setSelectedCard(m.index);
          setLeftTab("layers");
          break;
        case "cardReorder": {
          if (m.section !== PICKS_ID) break;
          const cur = picksOf(entriesRef.current);
          if (m.order.length !== cur.length || new Set(m.order).size !== cur.length || m.order.some((i) => i >= cur.length)) break;
          setSelectedCard((sc) => (sc === null ? null : m.order.indexOf(sc)));
          setPicks(m.order.map((i) => cur[i]));
          break;
        }
        case "reorder": {
          const map = new Map(entriesRef.current.map((e) => [entryId(e), e]));
          const next = m.ids.map((id) => map.get(id)).filter((x): x is LayoutEntry => !!x);
          if (next.length === entriesRef.current.length) {
            c.order = m.ids;
            setLayout(next);
          }
          break;
        }
        case "action": {
          const e = entriesRef.current.find((x) => entryId(x) === m.id);
          if (!e) break;
          if (m.action === "hide" || m.action === "show") {
            if (e.kind === "section") {
              const def = sectionByKeyRef.current.get(e.key);
              if (def?.required || def?.locked) break;
              patchEntry(m.id, (x) => (x.kind === "section" ? { ...x, hidden: m.action === "hide" } : x));
            } else {
              patchEntry(m.id, (x) => (x.kind === "block" ? { ...x, block: { ...x.block, hidden: m.action === "hide" } } : x));
            }
          } else if (m.action === "duplicate" && e.kind === "block") {
            const idx = entriesRef.current.findIndex((x) => entryId(x) === m.id);
            const copy: LayoutEntry = { kind: "block", block: { ...structuredClone(e.block), id: uid() } };
            const next = [...entriesRef.current];
            next.splice(idx + 1, 0, copy);
            setLayout(next);
            setSelectedId(entryId(copy));
          } else if (m.action === "copy" && e.kind === "block") {
            setClipboard(structuredClone(e.block));
            setMessage({ kind: "ok", text: "Copied — paste from the Blocks tab or a + button." });
          } else if (m.action === "delete" && e.kind === "block") {
            if (window.confirm("Delete this block?")) {
              setLayout(entriesRef.current.filter((x) => entryId(x) !== m.id));
              setSelectedId((cur) => (cur === m.id ? null : cur));
            }
          }
          break;
        }
        case "insertAt":
          setInsertAt(m.index);
          break;
        case "field": {
          const e = entriesRef.current.find((x) => entryId(x) === m.id);
          if (e?.kind !== "block") break;
          const settings = { ...e.block.settings, [m.field]: m.value };
          c.blockJson[m.id] = stableStr({ ...e.block, settings }); // canvas already shows it
          patchEntry(m.id, (x) => (x.kind === "block" ? { ...x, block: { ...x.block, settings } } : x));
          break;
        }
        case "rich": {
          const e = entriesRef.current.find((x) => entryId(x) === m.id);
          if (e?.kind !== "block") break;
          const doc = htmlToDoc(m.html);
          if (!doc) break;
          const settings = { ...e.block.settings, [m.field]: doc };
          c.blockJson[m.id] = stableStr({ ...e.block, settings });
          patchEntry(m.id, (x) => (x.kind === "block" ? { ...x, block: { ...x.block, settings } } : x));
          break;
        }
        case "region": {
          if (m.original !== null && !(m.region in regionsOriginal.current)) regionsOriginal.current[m.region] = m.original;
          if (regionsCanvas.current[m.region] === m.html) break; // duplicate delivery
          regionsCanvas.current[m.region] = m.html;
          const doc = htmlToDoc(m.html);
          if (!doc) break;
          setRegionDrafts((prev) => ({ ...prev, [m.region]: { html: m.html, doc } }));
          pushHistory(entriesRef.current);
          setDirty(true);
          break;
        }
        case "navigate":
          setMessage({ kind: "warn", text: `Links don't navigate inside the canvas — use PREVIEW for the real page. (${m.href})` });
          break;
        case "error":
          break; // surfaced by the frame's error banner
        case "height":
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLayout, pushHistory]
  );

  /* selecting from Layers highlights + scrolls the canvas */
  const selectFromPanel = (id: string | null) => {
    setSelectedId(id);
    canvasApi.current?.send({ ns: BB_NS, t: "select", id });
    if (id) canvasApi.current?.send({ ns: BB_NS, t: "scrollTo", id });
  };

  const openMedia = useCallback(
    async (blockId: string, field: string, index?: number) => {
      setMediaFor({ blockId, field, index });
      if (!mediaLists) {
        try {
          const res = await fetch("/api/admin/editor/media");
          const j = await res.json();
          setMediaLists({
            media: (j.media ?? []).map((m: { id: string; public_url: string; alt_text: string; caption: string | null; attribution_text: string }) => ({ id: m.id, url: m.public_url, alt: m.alt_text, caption: m.caption, attribution: m.attribution_text })),
            assets: (j.assets ?? []).map((a: { id: string; public_image_url: string; alt_text: string; caption: string | null; attribution_text: string }) => ({ id: a.id, url: a.public_image_url, alt: a.alt_text, caption: a.caption, attribution: a.attribution_text })),
          });
        } catch {
          setMediaLists({ media: [], assets: [] });
        }
      }
    },
    [mediaLists]
  );

  const applyMedia = (m: MediaItem) => {
    if (!mediaFor) return;
    const img: BlockImage = { src: m.url, alt: m.alt, caption: m.caption ?? "", attribution: m.attribution, mediaId: m.id, focal: "center" };
    const e = entries.find((x) => x.kind === "block" && x.block.id === mediaFor.blockId);
    if (e?.kind === "block") {
      if (mediaFor.field === "gallery") {
        const imgs = [...(((e.block.settings.images as BlockImage[]) ?? []))];
        imgs.push(img);
        updateSettings(mediaFor.blockId, { images: imgs.slice(0, 8) });
      } else {
        updateSettings(mediaFor.blockId, { [mediaFor.field]: img });
      }
    }
    setMediaFor(null);
  };

  const diff = useMemo(
    () => diffLayouts(publishedDoc ?? (target.kind === "static" || target.kind === "template" ? codeLayout(sectionsKeyFor(target.route)) : null), { type: "layout", blocks: entries }, sections),
    [publishedDoc, entries, sections, target]
  );

  const previewHref = target.kind === "nav" ? "/" : canvasRoute;
  const pendingRegionKeys = Object.keys(regionDrafts);
  const allTargets: Target[] = [...BASE_TARGETS, ...customPages.map<Target>((p) => ({ route: `/${p.slug}`, title: `${p.title} (${p.status})`, group: "My pages", kind: "custom", previewRoute: `/${p.slug}` }))];

  /* ============================================================ render */
  return (
    <div style={{ height: "calc(100vh - 46px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ---------------------------------------------------- top toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 14px", borderBottom: `2px solid ${INK}`, background: CARD, zIndex: 50 }}>
        {!embedded && (
        <select
          aria-label="Page"
          value={target.route}
          onChange={(e) => {
            const t = allTargets.find((x) => x.route === e.target.value);
            if (t) switchTarget(t);
          }}
          className="font-mono"
          style={{ ...selStyle, width: 250, fontSize: 12, fontWeight: 700 }}
        >
          {["Pages", "Templates", "Site", "My pages"].map((g) => (
            <optgroup key={g} label={g.toUpperCase()}>
              {allTargets
                .filter((t) => t.group === g)
                .map((t) => (
                  <option key={t.route} value={t.route}>{t.title}</option>
                ))}
            </optgroup>
          ))}
        </select>
        )}
        {embedded && (
          <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.title}</span>
        )}

        <span style={{ display: "flex", gap: 5 }} role="group" aria-label="Device preview">
          {DEVICES.map((d) => (
            <button key={d.key} type="button" onClick={() => setDevice(d)} style={iconBtn(device.key === d.key)} title={`${d.label} — ${d.width}px`}>
              {d.key === "desktop" ? <Monitor size={16} /> : d.key === "tablet" ? <Tablet size={16} /> : <Smartphone size={16} />}
            </button>
          ))}
        </span>
        <span style={{ display: "flex", gap: 4 }} role="group" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button
              key={String(z.key)}
              type="button"
              onClick={() => setZoom(z.key)}
              className="font-mono"
              style={{ ...iconBtn(zoom === z.key), width: "auto", padding: "0 9px", fontSize: 10.5, fontWeight: 700 }}
              title={z.key === "fit" ? "Fit canvas to the window" : `Zoom ${z.label}`}
            >
              {z.label}
            </button>
          ))}
        </span>
        <button type="button" onClick={undo} style={iconBtn()} title="Undo"><Undo2 size={16} /></button>
        <button type="button" onClick={redo} style={iconBtn()} title="Redo"><Redo2 size={16} /></button>
        <button type="button" onClick={() => canvasApi.current?.reload()} style={iconBtn()} title="Reload canvas"><RefreshCw size={15} /></button>

        <span style={{ flex: 1 }} />
        {message && (
          <span className="font-mono" role="status" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", maxWidth: 430, lineHeight: 1.5, color: message.kind === "error" ? ORANGE_DARK : message.kind === "warn" ? "#8a6d1a" : "rgba(29,25,19,.7)" }}>
            {message.text}
          </span>
        )}
        <a
          href={`/api/admin/editor/preview?route=${encodeURIComponent(previewHref)}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono"
          style={{ ...btn(), textDecoration: "none" }}
          title="Open the real page with this draft in a new tab (final check)"
        >
          <ExternalLink size={14} /> PREVIEW
        </a>
        <button type="button" onClick={saveDraft} disabled={busy !== null || migrationApplied === false} className="font-mono" style={btn()}>
          <Save size={14} /> {busy === "save" ? "SAVING…" : "SAVE DRAFT"}
        </button>
        {draftCommunity ? (
          <span
            className="font-mono"
            title="This page has not been exported yet — drafts are saved to the future route; publish unlocks once the CB-2 export is reviewed, merged, deployed, and the page is verified live."
            style={{ ...btn(), cursor: "help", opacity: 0.75 }}
          >
            <CloudUpload size={14} /> PUBLISH LOCKED — NOT EXPORTED
          </span>
        ) : (
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          disabled={busy !== null || draftVersion == null || dirty}
          className="font-mono"
          style={{ ...btn(true), opacity: draftVersion == null || dirty ? 0.5 : 1 }}
          title={dirty ? "Save the draft first" : undefined}
        >
          <CloudUpload size={14} /> PUBLISH…
        </button>
        )}
        <button type="button" onClick={() => setHistoryOpen(true)} className="font-mono" style={btn()}><HistoryIcon size={14} /> HISTORY</button>
        {target.kind === "custom" && (
          <button type="button" onClick={() => setSettingsOpen(true)} className="font-mono" style={btn()}><Settings2 size={14} /> PAGE SETTINGS</button>
        )}
        {!embedded && (
          <button type="button" onClick={() => setNewPageOpen(true)} className="font-mono" style={btn()}><Plus size={14} /> NEW PAGE</button>
        )}
        {!embedded && (
          <a href="/admin" className="font-mono" style={{ ...btn(), textDecoration: "none" }} title="Exit the builder — back to the console">
            <LogOut size={14} /> EXIT
          </a>
        )}
      </div>

      {migrationApplied === false && (
        <div className="font-mono" style={{ padding: "10px 16px", background: INK, color: "#E88D6B", fontSize: 11, letterSpacing: ".08em", lineHeight: 1.7 }}>
          MIGRATION 0019 NOT APPLIED — layouts, navigation, and new pages are read-only until supabase/migrations/0019_visual_builder.sql runs. Every public page renders its code-owned composition.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr) 320px", flex: 1, minHeight: 0 }} className="ed-desk">
        {/* --------------------------------------------------- left panel */}
        <aside style={{ borderRight: `2px solid ${INK}`, background: CARD, overflowY: "auto" }}>
          <div style={{ display: "flex", borderBottom: `1.5px solid rgba(29,25,19,.25)` }}>
            {((embedded ? ["blocks", "layers"] : ["pages", "blocks", "layers"]) as ("pages" | "blocks" | "layers")[]).map((t) => (
              <button key={t} type="button" onClick={() => setLeftTab(t)} className="font-mono" style={{ flex: 1, border: "none", borderBottom: leftTab === t ? `3px solid ${ORANGE}` : "3px solid transparent", background: "transparent", padding: "11px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", cursor: "pointer", color: leftTab === t ? INK : "rgba(29,25,19,.55)" }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ padding: "12px 12px 30px" }}>
            {leftTab === "pages" && (
              <>
                {(["Pages", "Templates", "Site"] as const).map((g) => (
                  <div key={g}>
                    <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>{g.toUpperCase()}</div>
                    {g === "Templates" && (
                      <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "rgba(29,25,19,.6)", margin: "0 0 6px" }}>
                        Shared templates drive EVERY page of their kind — publishing needs a typed confirmation.
                      </p>
                    )}
                    {BASE_TARGETS.filter((t) => t.group === g).map((t) => (
                      <TargetRow key={t.route} t={t} active={target.route === t.route} onPick={() => switchTarget(t)} />
                    ))}
                  </div>
                ))}
                <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>MY PAGES</div>
                {customPages.length === 0 && <div className="font-mono" style={{ fontSize: 10.5, color: "rgba(29,25,19,.5)" }}>None yet — + NEW PAGE.</div>}
                {customPages.map((p) => (
                  <TargetRow
                    key={p.slug}
                    t={{ route: `/${p.slug}`, title: `${p.title} · ${p.status.toUpperCase()}`, group: "My pages", kind: "custom", previewRoute: `/${p.slug}` }}
                    active={target.route === `/${p.slug}`}
                    onPick={() => switchTarget({ route: `/${p.slug}`, title: p.title, group: "My pages", kind: "custom", previewRoute: `/${p.slug}` })}
                  />
                ))}
              </>
            )}
            {leftTab === "blocks" && target.kind !== "nav" && (
              <>
                <p style={{ fontSize: 11.5, lineHeight: 1.55, color: "rgba(29,25,19,.6)", margin: "0 0 8px" }}>
                  Click to insert after the selected section — or use a <b>+</b> button right on the page.
                </p>
                {clipboard && (
                  <button type="button" className="font-mono" style={{ ...btn(true), width: "100%", marginBottom: 10, justifyContent: "center" }} onClick={() => pasteAt(null)}>
                    <ClipboardPaste size={13} /> PASTE “{BLOCK_DEF_BY_TYPE.get(clipboard.type)?.label}”
                  </button>
                )}
                {(["Content", "Media", "Conversion", "Site data", "Structure"] as const).map((cat) => (
                  <div key={cat}>
                    <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>{cat.toUpperCase()}</div>
                    {BLOCK_DEFS.filter((b) => b.category === cat)
                      .filter((b) => (target.kind === "custom" ? b.onCustomPages : b.onTemplates))
                      .map((b) => (
                        <button key={b.type} type="button" onClick={() => addBlockAt(b.type, null)} title={b.description} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: `1.5px solid rgba(29,25,19,.3)`, background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                          <span style={{ flex: 1 }}>{b.label}</span>
                          {b.protectedBlock && <Lock size={12} aria-label="Protected — plumbing/data locked" />}
                          <Plus size={13} color={ORANGE_DARK} />
                        </button>
                      ))}
                  </div>
                ))}
              </>
            )}
            {leftTab === "layers" && target.kind !== "nav" && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onLayerDragEnd}>
                <SortableContext items={entries.map(entryId)} strategy={verticalListSortingStrategy}>
                  {entries.map((e, i) => (
                    <LayerRow
                      key={entryId(e)}
                      entry={e}
                      index={i}
                      def={e.kind === "section" ? sectionByKey.get(e.key) : undefined}
                      selected={selectedId === entryId(e)}
                      onPick={() => selectFromPanel(entryId(e))}
                      onHide={() => toggleHidden(entryId(e))}
                      onDelete={() => {
                        if (window.confirm("Delete this block?")) removeEntry(entryId(e));
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {leftTab === "layers" && target.kind === "nav" && (
              <p style={{ fontSize: 12, color: "rgba(29,25,19,.6)" }}>The navigation editor lives in the center panel.</p>
            )}
          </div>
        </aside>

        {/* ------------------------------------------------------- canvas */}
        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "#E9E0CC" }}>
          {target.kind === "nav" ? (
            <div style={{ overflowY: "auto", padding: "22px 16px 80px" }}>
              <NavEditor items={navItems} customPages={customPages} onChange={(items) => { setNavItems(items); setDirty(true); }} />
            </div>
          ) : (
            <>
              <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 14px", fontSize: 10, letterSpacing: ".14em", color: "rgba(29,25,19,.55)", borderBottom: "1px solid rgba(29,25,19,.15)" }}>
                <span style={{ fontWeight: 700 }}>{canvasRoute}</span>
                <span>{device.width}PX</span>
                {target.route === "template:city" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    PREVIEWING AS
                    <select
                      aria-label="Preview city"
                      value={previewCity}
                      onChange={(e) => setPreviewCity(e.target.value)}
                      className="font-mono"
                      style={{ ...selStyle, width: 140, padding: "3px 6px", fontSize: 10.5 }}
                    >
                      {cities.map((ci) => (
                        <option key={ci.slug} value={ci.slug}>{ci.name}</option>
                      ))}
                    </select>
                  </span>
                )}
                {target.kind === "template" && <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>SHARED TEMPLATE — CHANGES AFFECT EVERY PAGE OF THIS KIND</span>}
                {HOOD_ROUTE_RE.test(target.route) &&
                  (draftCommunity ? (
                    <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>PRIVATE DRAFT PAGE — SAVES KEEP, PUBLISH UNLOCKS AFTER EXPORT + DEPLOY</span>
                  ) : (
                    <span style={{ color: "#2c6e49", fontWeight: 700 }}>THIS PAGE ONLY — THE SHARED HOOD TEMPLATE IS UNTOUCHED</span>
                  ))}
                <span style={{ flex: 1 }} />
                {dirty && <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>UNSAVED CHANGES</span>}
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <CanvasFrame
                  route={canvasRoute}
                  deviceWidth={device.width}
                  zoom={zoom}
                  apiRef={canvasApi}
                  onMsg={onCanvasMsg}
                  onReady={onCanvasReady}
                />
              </div>
            </>
          )}
        </main>

        {/* --------------------------------------------------- right panel */}
        <aside style={{ borderLeft: `2px solid ${INK}`, background: CARD, overflowY: "auto", padding: "14px 14px 40px" }}>
          {target.kind === "nav" ? (
            <div className="font-mono" style={{ fontSize: 11, lineHeight: 2, color: "rgba(29,25,19,.7)" }}>
              NAVIGATION RULES
              <br />· system links keep their destinations
              <br />· SEARCH HOMES can’t be hidden
              <br />· only published builder pages + homepage anchors may be added
              <br />· admin/account/api/auth can never enter public nav
            </div>
          ) : !selected ? (
            <div className="font-mono" style={{ fontSize: 11, lineHeight: 2, color: "rgba(29,25,19,.6)" }}>
              CLICK A SECTION ON THE PAGE TO EDIT IT.
              <br />
              <br />· double-click text to edit in place
              <br />· drag the ⠿ handle to reorder
              <br />· + buttons insert blocks
              <br />
              <br />
              PUBLISHED: {publishedDoc ? "layout override" : target.kind === "custom" ? "—" : "code-owned layout"}
              <br />
              DRAFT: {draftVersion ? `v${draftVersion}` : "—"}
              {pendingRegionKeys.length > 0 && (
                <>
                  <br />
                  TEXT EDITS: {pendingRegionKeys.join(", ")}
                </>
              )}
              {dirty && (
                <>
                  <br />
                  <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>UNSAVED CHANGES</span>
                </>
              )}
            </div>
          ) : selected.kind === "section" ? (
            selectedCard !== null && selectedSection?.cards === "editors-picks" ? (
              <PickCardPanel
                index={selectedCard}
                picks={picksOf(entries)}
                info={pickPhotos}
                onLoadInfo={loadPickInfo}
                onPicks={setPicks}
                onSelectCard={(i) => {
                  setSelectedCard(i);
                  canvasApi.current?.send({ ns: BB_NS, t: "cardSelect", section: PICKS_ID, index: i });
                }}
                onChangePhoto={(city) => {
                  setPhotoModalCity(city);
                  void loadPickInfo(city, true);
                }}
                onRefuse={(text) => setMessage({ kind: "error", text })}
              />
            ) : (
              <>
                <SectionSettings entry={selected} def={selectedSection} onChange={(patch) => updateEntry(selectedId!, (e) => (e.kind === "section" ? { ...e, ...patch } : e))} />
                {selectedSection?.cta && sectionsKeyFor(target.route) === "template:hood" && (
                  <HoodCtaPanel
                    value={selected.kind === "section" ? (selected.settings?.cta ?? null) : null}
                    isTemplate={target.kind === "template"}
                    onChange={(next) => {
                      ctaTouchedRef.current = true;
                      updateEntry(selectedId!, (e) => {
                        if (e.kind !== "section") return e;
                        const { settings: _drop, ...rest } = e;
                        void _drop;
                        // no fields set → no override stored (code CTA stays the truth)
                        return next ? { ...rest, settings: { cta: next } } : rest;
                      });
                    }}
                  />
                )}
                {selectedSection?.gallery && selected.kind === "section" && HOOD_ROUTE_RE.test(target.route) && (
                  <HoodGalleryPanel
                    routeKey={target.route.replace(/^\/city\//, "")}
                    order={selected.settings?.gallery?.order ?? null}
                    onChange={(orderNext) => {
                      ctaTouchedRef.current = true;
                      updateEntry(selectedId!, (e) => {
                        if (e.kind !== "section") return e;
                        const { settings: _drop, ...rest } = e;
                        void _drop;
                        return orderNext && orderNext.length ? { ...rest, settings: { gallery: { order: orderNext } } } : rest;
                      });
                    }}
                  />
                )}
                {selectedSection?.gallery && target.kind === "template" && (
                  <p className="font-mono" style={{ fontSize: 10, lineHeight: 1.8, color: "rgba(29,25,19,.6)", marginTop: 12 }}>
                    GALLERY PHOTOS AND ORDER ARE PAGE-SPECIFIC — open a community&rsquo;s own canvas (Community Studio) to arrange its frames.
                  </p>
                )}
                {selected.kind === "section" && selected.key === "hero" && HOOD_ROUTE_RE.test(target.route) && (
                  <HoodTaglinePanel
                    route={target.route}
                    pending={taglineDraft}
                    onChange={(v) => {
                      setTaglineDraft(v);
                      setDirty(true);
                    }}
                  />
                )}
              </>
            )
          ) : (
            <BlockSettings
              block={selectedBlock!}
              isTemplate={target.kind !== "custom"}
              onStyle={(patch) => updateBlock(selectedBlock!.id, { style: { ...selectedBlock!.style, ...patch } })}
              onMeta={(patch) => updateBlock(selectedBlock!.id, patch)}
              onSettings={(patch) => updateSettings(selectedBlock!.id, patch)}
              onMedia={(field, index) => openMedia(selectedBlock!.id, field, index)}
            />
          )}
        </aside>
      </div>

      {/* ------------------------------------------------ insert picker */}
      {insertAt !== null && target.kind !== "nav" && (
        <Modal title="INSERT A BLOCK HERE" onClose={() => setInsertAt(null)}>
          {clipboard && (
            <button type="button" className="font-mono" style={{ ...btn(true), width: "100%", marginBottom: 10, justifyContent: "center" }} onClick={() => { pasteAt(insertAt); setInsertAt(null); }}>
              <ClipboardPaste size={13} /> PASTE “{BLOCK_DEF_BY_TYPE.get(clipboard.type)?.label}”
            </button>
          )}
          {(["Content", "Media", "Conversion", "Site data", "Structure"] as const).map((cat) => {
            const defs = BLOCK_DEFS.filter((b) => b.category === cat).filter((b) => (target.kind === "custom" ? b.onCustomPages : b.onTemplates));
            if (!defs.length) return null;
            return (
              <div key={cat}>
                <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>{cat.toUpperCase()}</div>
                {defs.map((b) => (
                  <button key={b.type} type="button" onClick={() => { addBlockAt(b.type, insertAt); setInsertAt(null); }} title={b.description} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: `1.5px solid rgba(29,25,19,.3)`, background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{b.label}</span>
                    {b.protectedBlock && <Lock size={12} aria-label="Protected" />}
                    <Plus size={13} color={ORANGE_DARK} />
                  </button>
                ))}
              </div>
            );
          })}
        </Modal>
      )}

      {/* ------------------------------------------------- publish modal */}
      {publishOpen && (
        <Modal title={target.kind === "template" ? "PUBLISH SHARED TEMPLATE" : target.kind === "nav" ? "PUBLISH NAVIGATION" : "PUBLISH PAGE LAYOUT"} onClose={() => setPublishOpen(false)}>
          {target.kind !== "nav" && (
            <div className="font-mono" style={{ fontSize: 11, lineHeight: 2 }}>
              {diff.added.length > 0 && <div>➕ ADDED: {diff.added.join(" · ")}</div>}
              {diff.removed.length > 0 && <div>➖ REMOVED: {diff.removed.join(" · ")}</div>}
              {diff.moved.length > 0 && <div>↕ MOVED: {diff.moved.join(" · ")}</div>}
              {diff.hidden.length > 0 && <div>🚫 HIDDEN: {diff.hidden.join(" · ")}</div>}
              {diff.shown.length > 0 && <div>👁 SHOWN AGAIN: {diff.shown.join(" · ")}</div>}
              {diff.edited.length > 0 && <div>✏ EDITED: {diff.edited.join(" · ")}</div>}
              {Object.keys(savedRegionsRef.current).length > 0 && (
                <div>✏ TEXT DRAFTS PUBLISHING TOO: {Object.keys(savedRegionsRef.current).join(" · ")}</div>
              )}
              {target.route === "/" && missingPhotos.length > 0 && (
                <div style={{ color: ORANGE_DARK, marginTop: 6 }}>
                  ⛔ PUBLISH WILL BE REFUSED — no APPROVED homepage-pick photo for: {missingPhotos.map((c) => bySlug[c]?.name ?? c).join(", ")}. Approve one in the Photo Desk first.
                </div>
              )}
              {!diff.added.length && !diff.removed.length && !diff.moved.length && !diff.hidden.length && !diff.shown.length && !diff.edited.length && !Object.keys(savedRegionsRef.current).length && (
                <div>NO STRUCTURAL DIFFERENCE FROM WHAT IS LIVE.</div>
              )}
            </div>
          )}
          {target.kind === "nav" && <p style={{ fontSize: 13, lineHeight: 1.6 }}>The site navigation changes for every visitor on publish.</p>}
          {target.kind === "template" && (
            <>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: ORANGE_DARK, fontWeight: 700 }}>
                ⚠ This is a SHARED TEMPLATE — publishing changes EVERY {target.route === "template:city" ? "city report (90 pages)" : "neighborhood & community page (~360 pages)"} at once.
              </p>
              <Field label='TYPE "PUBLISH TEMPLATE" TO CONFIRM'>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} style={inputStyle} />
              </Field>
            </>
          )}
          {target.kind === "custom" && (
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              Publishing makes /{target.route.slice(1)} public, indexable, and adds it to the sitemap.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={publish} disabled={busy !== null || (target.kind === "template" && confirmText !== "PUBLISH TEMPLATE")} className="font-mono" style={{ ...btn(true), flex: 1, justifyContent: "center", opacity: target.kind === "template" && confirmText !== "PUBLISH TEMPLATE" ? 0.5 : 1 }}>
              {busy === "publish" ? "PUBLISHING…" : `CONFIRM — PUBLISH v${draftVersion}`}
            </button>
            <button type="button" onClick={() => setPublishOpen(false)} className="font-mono" style={{ ...btn(), flex: 1, justifyContent: "center" }}>CANCEL</button>
          </div>
        </Modal>
      )}

      {/* ------------------------------------------------- history modal */}
      {historyOpen && (
        <Modal title="VERSION HISTORY" onClose={() => setHistoryOpen(false)}>
          {versions.length === 0 && <div className="font-mono" style={{ fontSize: 11 }}>NO VERSIONS YET — THIS LAYOUT IS PURE CODE.</div>}
          {versions.map((v) => (
            <div key={v.versionNo} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
              <div className="font-mono" style={{ fontSize: 11, fontWeight: 700 }}>v{v.versionNo} · {v.status.toUpperCase()}</div>
              <div className="font-mono" style={{ fontSize: 10, color: "rgba(29,25,19,.6)" }}>{new Date(v.createdAt).toLocaleString()} · {v.createdBy}</div>
              {v.status !== "published" && v.status !== "draft" && (
                <button
                  type="button"
                  className="font-mono"
                  style={{ marginTop: 6, border: "none", background: "none", color: ORANGE_DARK, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
                  onClick={async () => {
                    if (target.kind === "template" && !window.confirm("Rolling back republishes this version on EVERY page using the template. Continue?")) return;
                    setBusy("rollback");
                    const j = await post("/api/admin/editor/rollback", { route: target.route, regionKey: target.kind === "nav" ? "nav" : "__layout", targetVersionNo: v.versionNo });
                    setBusy(null);
                    setHistoryOpen(false);
                    setMessage(j.ok ? { kind: "ok", text: `Rolled back — v${j.publishedVersion} is live` } : { kind: "error", text: String(j.error ?? "Rollback failed") });
                    if (j.ok) {
                      await loadTarget(target);
                      canvasApi.current?.reload();
                    }
                  }}
                >
                  ⟲ ROLL BACK TO v{v.versionNo}…
                </button>
              )}
            </div>
          ))}
          {(target.kind === "static" || target.kind === "template") && publishedDoc && (
            <button
              type="button"
              className="font-mono"
              style={{ ...btn(false, true), width: "100%", marginTop: 6, justifyContent: "center" }}
              onClick={async () => {
                if (!window.confirm("Restore the code-owned layout? The published override is cleared; history stays.")) return;
                setBusy("restore");
                const j = await post("/api/admin/editor/restore", { route: target.route, regionKey: "__layout" });
                setBusy(null);
                setHistoryOpen(false);
                setMessage(j.ok ? { kind: "ok", text: "Code layout restored" } : { kind: "error", text: String(j.error ?? "Restore failed") });
                if (j.ok) {
                  await loadTarget(target);
                  canvasApi.current?.reload();
                }
              }}
            >
              RESTORE CODE LAYOUT…
            </button>
          )}
        </Modal>
      )}

      {/* ------------------------------------------- page settings modal */}
      {settingsOpen && target.kind === "custom" && (
        <PageSettingsModal
          page={customPages.find((p) => `/${p.slug}` === target.route)}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSave={async (settings) => {
            setBusy("settings");
            const j = await post("/api/admin/editor/site-pages", { action: "update", slug: target.route.slice(1), ...settings });
            setBusy(null);
            if (j.ok) {
              setSettingsOpen(false);
              setMessage({ kind: "ok", text: "Page settings saved" });
              loadCustomPages();
            } else {
              setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") });
            }
          }}
          onUnpublish={async () => {
            if (!window.confirm("Unpublish this page? It returns to draft — 404/noindex for visitors, out of the sitemap.")) return;
            setBusy("unpublish");
            const j = await post("/api/admin/editor/site-pages", { action: "unpublish", slug: target.route.slice(1) });
            setBusy(null);
            setSettingsOpen(false);
            setMessage(j.ok ? { kind: "ok", text: "Page unpublished — draft only" } : { kind: "error", text: String(j.error ?? "Failed") });
            loadCustomPages();
          }}
        />
      )}

      {/* ------------------------------------------------ new page modal */}
      {newPageOpen && (
        <NewPageModal
          busy={busy}
          onClose={() => setNewPageOpen(false)}
          onCreate={async (title, slug, template) => {
            setBusy("create");
            const j = await post("/api/admin/editor/site-pages", { action: "create", title, slug, template });
            setBusy(null);
            if (j.ok) {
              setNewPageOpen(false);
              setMessage({ kind: "ok", text: `Draft page /${j.slug} created — invisible to visitors until you publish` });
              await loadCustomPages();
              switchTarget({ route: `/${j.slug}`, title, group: "My pages", kind: "custom", previewRoute: `/${j.slug}` });
            } else {
              return ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Create failed";
            }
            return null;
          }}
        />
      )}

      {/* ------------------------------------------- pick photo modal */}
      {photoModalCity && (
        <PickPhotoModal
          city={photoModalCity}
          info={pickPhotos[photoModalCity] ?? null}
          onClose={() => setPhotoModalCity(null)}
          onRefresh={() => loadPickInfo(photoModalCity, true)}
        />
      )}

      {/* ---------------------------------------------------- media modal */}
      {mediaFor && (
        <Modal title="CHOOSE IMAGE" onClose={() => setMediaFor(null)} wide>
          <MediaPicker
            lists={mediaLists}
            onPick={applyMedia}
            onUploaded={(m) => {
              setMediaLists((prev) => (prev ? { ...prev, media: [m, ...prev.media] } : { media: [m], assets: [] }));
              applyMedia(m);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ================================================================ rows */
function TargetRow({ t, active, onPick }: { t: Target; active: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: active ? INK : "transparent", color: active ? CREAM : INK, borderRadius: 7, padding: "8px 9px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 2 }}>
      {t.title}
    </button>
  );
}

/** one entry in the Layers list — synced selection, dnd + keyboard reorder */
function LayerRow({
  entry,
  index,
  def,
  selected,
  onPick,
  onHide,
  onDelete,
}: {
  entry: LayoutEntry;
  index: number;
  def?: SectionDef;
  selected: boolean;
  onPick: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const id = entryId(entry);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const isSection = entry.kind === "section";
  const hidden = isSection ? entry.hidden : entry.block.hidden;
  const lockish = isSection ? !!(def?.locked || def?.required) : !!BLOCK_DEF_BY_TYPE.get(entry.block.type)?.protectedBlock;
  const label = isSection ? def?.label ?? entry.key : BLOCK_DEF_BY_TYPE.get(entry.block.type)?.label ?? entry.block.type;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.6 : hidden ? 0.55 : 1,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: selected ? INK : "transparent",
        color: selected ? CREAM : INK,
        borderRadius: 7,
        padding: "5px 6px",
        marginBottom: 2,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder (space to lift, arrows to move)"
        title="Drag to reorder"
        style={{ cursor: "grab", border: "none", background: "none", color: "inherit", display: "flex", padding: 2 }}
      >
        <GripVertical size={13} />
      </button>
      <button type="button" onClick={onPick} style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, border: "none", background: "none", color: "inherit", textAlign: "left", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", overflow: "hidden", padding: 0 }}>
        <span className="font-mono" style={{ fontSize: 9.5, opacity: 0.55 }}>{index + 1}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {lockish && <Lock size={11} aria-label="Protected" />}
      </button>
      {!(isSection && lockish) && (
        <button type="button" onClick={onHide} title={hidden ? "Show" : "Hide"} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", display: "flex", padding: 2 }}>
          {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
      {!isSection && (
        <button type="button" onClick={onDelete} title="Delete block" style={{ border: "none", background: "none", color: selected ? "#F1A08A" : ORANGE_DARK, cursor: "pointer", display: "flex", padding: 2 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/* =========================================================== settings */
function SectionSettings({ entry, def, onChange }: { entry: Extract<LayoutEntry, { kind: "section" }>; def: SectionDef | null | undefined; onChange: (patch: Partial<Extract<LayoutEntry, { kind: "section" }>>) => void }) {
  const lockish = def?.required || def?.locked;
  return (
    <div>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>{def?.label?.toUpperCase() ?? entry.key}</div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(29,25,19,.7)" }}>
        {def?.description ?? "Code-owned section. The real component renders on the live page and in Preview; the builder controls only where it sits."}
      </p>
      {lockish ? (
        <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, background: "rgba(29,25,19,.07)", borderRadius: 8, padding: "8px 10px" }}>
          🔒 {def?.required ? "REQUIRED — carries the page H1, the search room, or compliance content. It cannot be hidden or removed." : "PROTECTED — live data or plumbing. It can move, but not hide, change, or leave the page."}
        </div>
      ) : (
        <>
          <Field label="VISIBILITY">
            <select value={entry.visibility} onChange={(e) => onChange({ visibility: e.target.value as (typeof VISIBILITIES)[number] })} style={selStyle}>
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>{v === "all" ? "All devices" : v === "desktop" ? "Desktop only" : "Mobile only"}</option>
              ))}
            </select>
          </Field>
          <Field label="HIDDEN">
            <select value={entry.hidden ? "yes" : "no"} onChange={(e) => onChange({ hidden: e.target.value === "yes" })} style={selStyle}>
              <option value="no">Shown</option>
              <option value="yes">Hidden</option>
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------- hood CTA override (A2) */
const CITY_SLUG_SET = new Set(cities.map((c) => c.slug));

/** one CTA button's destination: default, a supported lead intent, or a
    validated internal path — the closed world sanitizeHoodCta enforces */
function CtaActionField({
  label,
  action,
  onAction,
}: {
  label: string;
  action?: string;
  onAction: (a: string | undefined) => void;
}) {
  const isPath = !!action && !action.startsWith("intent:");
  return (
    <>
      <Field label={label}>
        <select
          value={isPath ? "__path" : (action ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__path") onAction("/homes");
            else onAction(v || undefined);
          }}
          style={selStyle}
        >
          <option value="">Default action</option>
          {INTENT_KEYS.map((k) => (
            <option key={k} value={`intent:${k}`}>Lead: {INTENTS[k].cta}</option>
          ))}
          <option value="__path">Internal link…</option>
        </select>
      </Field>
      {isPath && (
        <Field label="INTERNAL PATH">
          <input value={action} onChange={(e) => onAction(e.target.value)} placeholder="/homes · /land · /city/frisco" style={inputStyle} />
          {!isAllowedCtaAction(action ?? "", CITY_SLUG_SET) && (
            <div className="font-mono" style={{ marginTop: 4, fontSize: 9.5, color: ORANGE_DARK, fontWeight: 700 }}>
              NOT AN ALLOWED DESTINATION — allowed: /, /homes, /land, /new-builds, /how-we-research, /city/&lt;city&gt;[/community], /#anchor. The save will be refused.
            </div>
          )}
        </Field>
      )}
    </>
  );
}

/** Amendment 2: the page-specific conversion-band settings. Everything is
    optional; leaving a field empty keeps the code default, and clearing all
    fields removes the override entirely (byte-for-byte code CTA). */
function HoodCtaPanel({
  value,
  isTemplate,
  onChange,
}: {
  value: HoodCtaSettings | null;
  isTemplate: boolean;
  onChange: (next: HoodCtaSettings | null) => void;
}) {
  const v = value ?? {};
  const set = (patch: Partial<Record<keyof HoodCtaSettings, string | boolean | undefined>>) => {
    const next = { ...v, ...patch } as HoodCtaSettings;
    for (const k of Object.keys(next) as (keyof HoodCtaSettings)[]) {
      const val = next[k];
      if (val === "" || val === undefined || val === false) delete next[k];
    }
    onChange(Object.keys(next).length ? next : null);
  };
  return (
    <div style={{ marginTop: 18, borderTop: `1.5px solid rgba(29,25,19,.25)`, paddingTop: 12 }}>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
        THIS PAGE&rsquo;S CTA {value ? "· OVERRIDDEN" : "· CODE DEFAULT"}
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "rgba(29,25,19,.65)", margin: "6px 0 0" }}>
        Empty fields keep the code CTA. Destinations are limited to supported lead actions and validated internal
        paths. Changes appear on the canvas after SAVE DRAFT.
        {isTemplate && (
          <strong style={{ color: ORANGE_DARK }}> You are editing the SHARED TEMPLATE — this CTA would apply to EVERY community page without its own override.</strong>
        )}
      </p>
      <Field label="KICKER">
        <input value={v.kicker ?? ""} maxLength={60} onChange={(e) => set({ kicker: e.target.value })} placeholder="(code default)" style={inputStyle} />
      </Field>
      <Field label="HEADLINE">
        <input value={v.heading ?? ""} maxLength={120} onChange={(e) => set({ heading: e.target.value })} placeholder="(code default)" style={inputStyle} />
      </Field>
      <Field label="SUPPORTING COPY">
        <textarea value={v.body ?? ""} maxLength={400} rows={3} onChange={(e) => set({ body: e.target.value })} placeholder="(code default)" style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      <Field label="PRIMARY BUTTON LABEL">
        <input value={v.primaryLabel ?? ""} maxLength={40} onChange={(e) => set({ primaryLabel: e.target.value })} placeholder="(code default)" style={inputStyle} />
      </Field>
      <CtaActionField label="PRIMARY BUTTON ACTION" action={v.primaryAction} onAction={(a) => set({ primaryAction: a })} />
      <Field label="SECONDARY BUTTON">
        <select value={v.hideSecondary ? "hidden" : "shown"} onChange={(e) => set({ hideSecondary: e.target.value === "hidden" ? true : undefined })} style={selStyle}>
          <option value="shown">Shown</option>
          <option value="hidden">Removed</option>
        </select>
      </Field>
      {!v.hideSecondary && (
        <>
          <Field label="SECONDARY BUTTON LABEL">
            <input value={v.secondaryLabel ?? ""} maxLength={40} onChange={(e) => set({ secondaryLabel: e.target.value })} placeholder="(code default)" style={inputStyle} />
          </Field>
          <CtaActionField label="SECONDARY BUTTON ACTION" action={v.secondaryAction} onAction={(a) => set({ secondaryAction: a })} />
        </>
      )}
      {value && (
        <button type="button" className="font-mono" onClick={() => onChange(null)} style={{ ...btn(false, true), marginTop: 12 }}>
          REMOVE OVERRIDE — BACK TO THE CODE CTA
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------ hood gallery order (A3) */
/** Reorders (and selects among) the APPROVED gallery frames for THIS page.
    Ordering is all this stores — photos, approval, metadata, and licensing
    live in the Photo Desk and are never bypassed here. */
function HoodGalleryPanel({
  routeKey,
  order,
  onChange,
}: {
  /** "city/slug" — the neighborhood entity key */
  routeKey: string;
  order: string[] | null;
  onChange: (order: string[] | null) => void;
}) {
  const [slots, setSlots] = useState<GallerySlotInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await (await fetch(`/api/admin/editor/pick-photos?entity=neighborhood&key=${encodeURIComponent(routeKey)}`)).json();
        if (alive && j.ok) setSlots((j.gallery as GallerySlotInfo[]) ?? []);
      } catch {
        if (alive) setSlots([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeKey]);
  const approved = (slots ?? []).filter((g) => g.asset);
  const approvedKeys = approved.map((g) => g.slotKey);
  const bySlot = new Map(approved.map((g) => [g.slotKey, g]));
  const effective = (order ?? approvedKeys).filter((k) => approvedKeys.includes(k));
  const hiddenKeys = approvedKeys.filter((k) => !effective.includes(k));
  // identity order (or nothing left) → no override stored
  const commit = (next: string[]) => onChange(!next.length || stableStr(next) === stableStr(approvedKeys) ? null : next);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...effective];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  return (
    <div style={{ marginTop: 18, borderTop: `1.5px solid rgba(29,25,19,.25)`, paddingTop: 12 }}>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
        GALLERY ORDER — THIS PAGE ONLY {order ? "· CUSTOM" : "· DEFAULT"}
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "rgba(29,25,19,.65)", margin: "6px 0 0" }}>
        Approved Photo Desk frames only. Photos, approvals, and metadata are managed in the Studio&rsquo;s PHOTOS tab —
        this panel only picks the order. Changes appear on the canvas after SAVE DRAFT.
      </p>
      {slots === null ? (
        <div className="font-mono" style={{ fontSize: 10, marginTop: 8 }}>CHECKING THE PHOTO DESK…</div>
      ) : approved.length === 0 ? (
        <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.8, marginTop: 8, color: "rgba(29,25,19,.6)" }}>
          NO APPROVED GALLERY PHOTOS YET — the section stays hidden on the public page. Add and approve photos via the
          Studio&rsquo;s PHOTOS tab / Photo Desk.
        </div>
      ) : (
        <>
          {effective.map((k, i) => {
            const g = bySlot.get(k)!;
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: 6, marginTop: 6, background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.asset!.public_image_url} alt={g.asset!.alt_text} style={{ width: 52, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${INK}` }} />
                <span className="font-mono" style={{ flex: 1, fontSize: 9.5, lineHeight: 1.5 }}>
                  {k.toUpperCase()}
                  <br />
                  <span style={{ color: "rgba(29,25,19,.55)" }}>{g.asset!.attribution_text.slice(0, 34)}</span>
                </span>
                <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtn(), opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === effective.length - 1} style={{ ...iconBtn(), opacity: i === effective.length - 1 ? 0.35 : 1 }}>↓</button>
                <button
                  type="button"
                  title="Remove from this page's gallery (the photo stays approved in the Photo Desk)"
                  onClick={() => {
                    const next = effective.filter((x) => x !== k);
                    if (!next.length) onChange(null);
                    else onChange(next);
                  }}
                  style={iconBtn()}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {hiddenKeys.length > 0 && (
            <div className="font-mono" style={{ fontSize: 9.5, marginTop: 8, color: "rgba(29,25,19,.6)" }}>
              NOT SHOWN:{" "}
              {hiddenKeys.map((k) => (
                <button key={k} type="button" className="font-mono" onClick={() => onChange([...effective, k])} style={{ ...btn(), padding: "3px 8px", fontSize: 9.5, marginRight: 4 }}>
                  + {k.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {order && (
            <button type="button" className="font-mono" onClick={() => onChange(null)} style={{ ...btn(), marginTop: 10 }}>
              RESET TO DEFAULT ORDER (ALL APPROVED)
            </button>
          )}
          <div className="font-mono" style={{ fontSize: 9, lineHeight: 1.7, marginTop: 8, color: "rgba(29,25,19,.5)" }}>
            Removing every frame resets to the default order — hide the SECTION to hide the whole gallery.
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------- hood tagline panel (A4) */
/** The tagline is a TEXT-typed region ({value} document) — it is edited
    HERE, from the panel, while the hero is selected on the canvas. It is
    deliberately NOT an inline-editable region: a rich-doc commit would
    corrupt its typed shape. */
function HoodTaglinePanel({
  route,
  pending,
  onChange,
}: {
  route: string;
  pending: string | null;
  onChange: (v: string) => void;
}) {
  const [info, setInfo] = useState<{ current: string | null; status: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await (await fetch(`/api/admin/editor/doc?route=${encodeURIComponent(route)}&region=tagline`)).json();
        if (!alive) return;
        const draftVal = (j.draft?.content_json as { attrs?: { value?: string } } | undefined)?.attrs?.value ?? null;
        const pubVal = (j.published?.content_json as { attrs?: { value?: string } } | undefined)?.attrs?.value ?? null;
        setInfo({
          current: draftVal ?? pubVal,
          status: draftVal ? "draft override" : pubVal ? "published override" : "code formula — no override yet",
        });
      } catch {
        if (alive) setInfo({ current: null, status: "store unavailable — the page renders its code formula" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [route]);
  return (
    <div style={{ marginTop: 18, borderTop: `1.5px solid rgba(29,25,19,.25)`, paddingTop: 12 }}>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
        TAGLINE — THIS PAGE ONLY
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "rgba(29,25,19,.65)", margin: "6px 0 0" }}>
        The italic line under the H1. Saved with SAVE DRAFT (max 300 chars); the canvas shows it after the save.
        Source: {info ? info.status : "loading…"}
      </p>
      <Field label="TAGLINE">
        <textarea
          value={pending ?? info?.current ?? ""}
          maxLength={300}
          rows={2}
          placeholder={info?.status.startsWith("code formula") ? "(type to override the formula tagline)" : ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>
      {pending !== null && (
        <div className="font-mono" style={{ marginTop: 4, fontSize: 9.5, color: ORANGE_DARK, fontWeight: 700 }}>
          UNSAVED — SAVE DRAFT persists it{pending.trim() ? "" : " (empty is refused; use the CONTENT desk to restore the fallback)"}
        </div>
      )}
    </div>
  );
}

function ButtonsEditor({ buttons, onChange }: { buttons: BlockButton[]; onChange: (b: BlockButton[]) => void }) {
  return (
    <div>
      {buttons.map((b, i) => (
        <div key={i} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: 8, marginTop: 8 }}>
          <input value={b.label} placeholder="Label" aria-label={`Button ${i + 1} label`} onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={inputStyle} />
          <input value={b.href} placeholder="/homes or https://…" aria-label={`Button ${i + 1} link`} onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} style={{ ...inputStyle, marginTop: 6 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <select value={b.style} aria-label={`Button ${i + 1} style`} onChange={(e) => onChange(buttons.map((x, j) => (j === i ? { ...x, style: e.target.value as BlockButton["style"] } : x)))} style={{ ...selStyle, flex: 1 }}>
              <option value="primary">Primary (orange)</option>
              <option value="secondary">Secondary (outline)</option>
            </select>
            <button type="button" className="font-mono" onClick={() => onChange(buttons.filter((_, j) => j !== i))} style={{ ...btn(false, true), padding: "4px 10px" }}>✕</button>
          </div>
        </div>
      ))}
      {buttons.length < 2 && (
        <button type="button" className="font-mono" onClick={() => onChange([...buttons, { label: "Button", href: "/homes", style: "primary" }])} style={{ ...btn(), marginTop: 8 }}>
          + ADD BUTTON
        </button>
      )}
    </div>
  );
}

function BlockSettings({
  block,
  isTemplate,
  onStyle,
  onMeta,
  onSettings,
  onMedia,
}: {
  block: BlockInstance;
  isTemplate: boolean;
  onStyle: (patch: Partial<BlockInstance["style"]>) => void;
  onMeta: (patch: Partial<BlockInstance>) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onMedia: (field: string, index?: number) => void;
}) {
  const def = BLOCK_DEF_BY_TYPE.get(block.type);
  const s = block.settings as Record<string, unknown>;
  const richRef = useRef<RichEditorHandle | null>(null);
  const fullBleed = ["newsletter", "cityIndex", "communityDirectory", "metroMap"].includes(block.type);

  // hydrate the mini rich editor when a rich-capable block is selected
  useEffect(() => {
    if ((block.type === "richtext" || block.type === "imageText") && s.doc) {
      const t = setTimeout(() => richRef.current?.setContent(s.doc as object), 30);
      return () => clearTimeout(t);
    }
  }, [block.id, block.type, s.doc]);

  const imageFields = (field: string) => {
    const im = s[field] as BlockImage | null;
    return (
      <>
        <Field label="IMAGE">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {im?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={im.src} alt={im.alt} style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 6, border: `1.5px solid ${INK}` }} />
            ) : (
              <span className="font-mono" style={{ fontSize: 9, opacity: 0.6 }}>NONE</span>
            )}
            <button type="button" className="font-mono" onClick={() => onMedia(field)} style={btn()}>
              {im?.src ? "REPLACE…" : "CHOOSE…"}
            </button>
          </div>
        </Field>
        {im && (
          <>
            <Field label="ALT TEXT (required to publish)">
              <input value={im.alt} onChange={(e) => onSettings({ [field]: { ...im, alt: e.target.value } })} style={inputStyle} />
            </Field>
            <Field label="CAPTION">
              <input value={im.caption} onChange={(e) => onSettings({ [field]: { ...im, caption: e.target.value } })} style={inputStyle} />
            </Field>
            <Field label="ATTRIBUTION">
              <input value={im.attribution} onChange={(e) => onSettings({ [field]: { ...im, attribution: e.target.value } })} style={inputStyle} />
            </Field>
            <Field label="FOCAL POINT">
              <select value={im.focal} onChange={(e) => onSettings({ [field]: { ...im, focal: e.target.value } })} style={selStyle}>
                {["center", "top", "bottom", "left", "right"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </>
    );
  };

  return (
    <div>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
        {def?.label?.toUpperCase()} {def?.protectedBlock ? "· 🔒 PROTECTED" : ""}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.55, color: "rgba(29,25,19,.65)", marginTop: 4 }}>{def?.description}</p>

      {/* ---- per-type content ---- */}
      {block.type === "hero" && (
        <>
          <Field label="KICKER"><input value={String(s.kicker ?? "")} onChange={(e) => onSettings({ kicker: e.target.value })} style={inputStyle} /></Field>
          <Field label="HEADLINE"><input value={String(s.heading ?? "")} onChange={(e) => onSettings({ heading: e.target.value })} style={inputStyle} /></Field>
          <Field label="SUPPORTING LINE"><textarea value={String(s.sub ?? "")} rows={2} onChange={(e) => onSettings({ sub: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          {!isTemplate && (
            <Field label="HEADING LEVEL">
              <select value={String(s.level ?? "h1")} onChange={(e) => onSettings({ level: e.target.value })} style={selStyle}>
                <option value="h1">H1 — page title (exactly one per page)</option>
                <option value="h2">H2</option>
              </select>
            </Field>
          )}
          <Field label="BUTTONS"><ButtonsEditor buttons={(s.buttons as BlockButton[]) ?? []} onChange={(b) => onSettings({ buttons: b })} /></Field>
        </>
      )}
      {(block.type === "richtext" || block.type === "imageText") && (
        <Field label="RICH TEXT">
          <RichEditor ref={richRef} allowImages={false} onDirty={() => { const j = richRef.current?.getContent(); if (j) onSettings({ doc: j }); }} onAddImage={() => undefined} />
        </Field>
      )}
      {(block.type === "image" || block.type === "editorialPhoto") && (
        <>
          {imageFields("image")}
          <Field label="PLACEMENT">
            <select value={String(s.placement ?? "full")} onChange={(e) => onSettings({ placement: e.target.value })} style={selStyle}>
              {["full", "left", "right"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </>
      )}
      {block.type === "imageText" && (
        <>
          {imageFields("image")}
          <Field label="IMAGE SIDE">
            <select value={String(s.imageSide ?? "left")} onChange={(e) => onSettings({ imageSide: e.target.value })} style={selStyle}>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
        </>
      )}
      {block.type === "gallery" && (
        <>
          <Field label="IMAGES">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {((s.images as BlockImage[]) ?? []).map((im, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.src} alt={im.alt} style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6, border: `1.5px solid ${INK}` }} />
                  <button type="button" onClick={() => onSettings({ images: ((s.images as BlockImage[]) ?? []).filter((_, j) => j !== i) })} style={{ position: "absolute", top: -6, right: -6, border: `1.5px solid ${INK}`, borderRadius: 99, width: 18, height: 18, fontSize: 9, cursor: "pointer", background: CREAM }}>✕</button>
                </div>
              ))}
              <button type="button" className="font-mono" onClick={() => onMedia("gallery")} style={btn()}>+ ADD</button>
            </div>
          </Field>
        </>
      )}
      {block.type === "cta" && (
        <>
          <Field label="KICKER"><input value={String(s.kicker ?? "")} onChange={(e) => onSettings({ kicker: e.target.value })} style={inputStyle} /></Field>
          <Field label="HEADLINE"><input value={String(s.heading ?? "")} onChange={(e) => onSettings({ heading: e.target.value })} style={inputStyle} /></Field>
          <Field label="BODY"><textarea value={String(s.body ?? "")} rows={2} onChange={(e) => onSettings({ body: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <Field label="BUTTONS"><ButtonsEditor buttons={(s.buttons as BlockButton[]) ?? []} onChange={(b) => onSettings({ buttons: b })} /></Field>
        </>
      )}
      {block.type === "faq" && (
        <Field label="FAQ ITEMS (drive FAQPage JSON-LD)">
          {((s.items as { q: string; a: string }[]) ?? []).map((it, i) => (
            <div key={i} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: 8, marginTop: 8 }}>
              <input value={it.q} placeholder="Question" onChange={(e) => onSettings({ items: ((s.items as { q: string; a: string }[]) ?? []).map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} style={inputStyle} />
              <textarea value={it.a} rows={2} placeholder="Answer" onChange={(e) => onSettings({ items: ((s.items as { q: string; a: string }[]) ?? []).map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} style={{ ...inputStyle, marginTop: 6, resize: "vertical" }} />
              <button type="button" className="font-mono" onClick={() => onSettings({ items: ((s.items as { q: string; a: string }[]) ?? []).filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: ORANGE_DARK, fontSize: 9.5, fontWeight: 700, cursor: "pointer", padding: "6px 0 0" }}>✕ REMOVE</button>
            </div>
          ))}
          <button type="button" className="font-mono" onClick={() => onSettings({ items: [...(((s.items as { q: string; a: string }[]) ?? [])), { q: "", a: "" }] })} style={{ ...btn(), marginTop: 8 }}>+ ADD FAQ</button>
        </Field>
      )}
      {block.type === "featureGrid" && (
        <Field label="FEATURES">
          {((s.items as { title: string; note: string }[]) ?? []).map((it, i) => (
            <div key={i} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: 8, marginTop: 8 }}>
              <input value={it.title} placeholder="Title" onChange={(e) => onSettings({ items: ((s.items as { title: string; note: string }[]) ?? []).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} style={inputStyle} />
              <textarea value={it.note} rows={2} placeholder="Note" onChange={(e) => onSettings({ items: ((s.items as { title: string; note: string }[]) ?? []).map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} style={{ ...inputStyle, marginTop: 6, resize: "vertical" }} />
              <button type="button" className="font-mono" onClick={() => onSettings({ items: ((s.items as { title: string; note: string }[]) ?? []).filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: ORANGE_DARK, fontSize: 9.5, fontWeight: 700, cursor: "pointer", padding: "6px 0 0" }}>✕ REMOVE</button>
            </div>
          ))}
          <button type="button" className="font-mono" onClick={() => onSettings({ items: [...(((s.items as { title: string; note: string }[]) ?? [])), { title: "", note: "" }] })} style={{ ...btn(), marginTop: 8 }}>+ ADD FEATURE</button>
        </Field>
      )}
      {block.type === "statsBand" && (
        <Field label="FIGURES (editorial values you type)">
          {((s.items as { value: string; label: string }[]) ?? []).map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={it.value} placeholder="90" onChange={(e) => onSettings({ items: ((s.items as { value: string; label: string }[]) ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} style={{ ...inputStyle, width: 80 }} />
              <input value={it.label} placeholder="city reports" onChange={(e) => onSettings({ items: ((s.items as { value: string; label: string }[]) ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={inputStyle} />
              <button type="button" onClick={() => onSettings({ items: ((s.items as { value: string; label: string }[]) ?? []).filter((_, j) => j !== i) })} style={{ ...btn(false, true), padding: "4px 8px" }}>✕</button>
            </div>
          ))}
          {(((s.items as unknown[]) ?? []).length < 4) && (
            <button type="button" className="font-mono" onClick={() => onSettings({ items: [...(((s.items as { value: string; label: string }[]) ?? [])), { value: "", label: "" }] })} style={{ ...btn(), marginTop: 8 }}>+ ADD FIGURE</button>
          )}
        </Field>
      )}
      {block.type === "quote" && (
        <>
          <Field label="QUOTE"><textarea value={String(s.text ?? "")} rows={3} onChange={(e) => onSettings({ text: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <Field label="CITATION"><input value={String(s.cite ?? "")} onChange={(e) => onSettings({ cite: e.target.value })} style={inputStyle} /></Field>
        </>
      )}
      {block.type === "spacer" && (
        <Field label="SIZE">
          <select value={String(s.size ?? "md")} onChange={(e) => onSettings({ size: e.target.value })} style={selStyle}>
            {SPACINGS.map((x) => <option key={x} value={x}>{x === "sm" ? "Small" : x === "md" ? "Medium" : "Large"}</option>)}
          </select>
        </Field>
      )}
      {block.type === "searchPromo" && (
        <>
          <Field label="HEADLINE"><input value={String(s.heading ?? "")} onChange={(e) => onSettings({ heading: e.target.value })} style={inputStyle} /></Field>
          <Field label="BODY"><input value={String(s.body ?? "")} onChange={(e) => onSettings({ body: e.target.value })} style={inputStyle} /></Field>
          <Field label="SEARCH DESTINATION">
            <select value={String(s.target ?? "/homes")} onChange={(e) => onSettings({ target: e.target.value })} style={selStyle}>
              <option value="/homes">/homes — all listings</option>
              <option value="/land">/land — land only</option>
              <option value="/new-builds">/new-builds — new construction</option>
            </select>
          </Field>
          <Field label="BUTTON LABEL"><input value={String(s.buttonLabel ?? "")} onChange={(e) => onSettings({ buttonLabel: e.target.value })} style={inputStyle} /></Field>
        </>
      )}
      {block.type === "leadForm" && (
        <>
          <Field label="HEADLINE"><input value={String(s.heading ?? "")} onChange={(e) => onSettings({ heading: e.target.value })} style={inputStyle} /></Field>
          <Field label="PRIMARY INTENT (existing lead pipeline)">
            <select value={String(s.primary ?? "ask-a-question")} onChange={(e) => onSettings({ primary: e.target.value })} style={selStyle}>
              <option value="ask-a-question">Ask a Question</option>
              <option value="build-my-shortlist">Build My Shortlist</option>
              <option value="curated-homes">Curated Homes</option>
            </select>
          </Field>
        </>
      )}
      {(block.type === "featuredListings" || block.type === "marketSnapshot" || block.type === "nearbyAreas") && (
        <>
          {block.type === "featuredListings" && (
            <Field label="HEADLINE"><input value={String(s.heading ?? "")} onChange={(e) => onSettings({ heading: e.target.value })} style={inputStyle} /></Field>
          )}
          <Field label="CITY">
            <select value={String(s.citySlug ?? "")} onChange={(e) => onSettings({ citySlug: e.target.value })} style={selStyle}>
              {block.type === "featuredListings" && <option value="">All of DFW</option>}
              {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          {block.type === "featuredListings" && (
            <>
              <Field label="MAX PRICE (safe preset filters only)">
                <select value={String(s.maxPrice ?? "")} onChange={(e) => onSettings({ maxPrice: e.target.value })} style={selStyle}>
                  <option value="">Any price</option>
                  <option value="400000">Under $400K</option>
                  <option value="600000">Under $600K</option>
                  <option value="800000">Under $800K</option>
                  <option value="1000000">Under $1M</option>
                </select>
              </Field>
              <Field label="COUNT">
                <select value={String(s.count ?? "3")} onChange={(e) => onSettings({ count: e.target.value })} style={selStyle}>
                  <option value="3">3 cards</option>
                  <option value="6">6 cards</option>
                </select>
              </Field>
              <Field label="NEW CONSTRUCTION ONLY">
                <select value={s.newBuildsOnly === true ? "yes" : "no"} onChange={(e) => onSettings({ newBuildsOnly: e.target.value === "yes" })} style={selStyle}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </>
          )}
          {block.type === "nearbyAreas" && (
            <Field label="COUNT">
              <select value={String(s.count ?? "3")} onChange={(e) => onSettings({ count: e.target.value })} style={selStyle}>
                {["3", "4", "6"].map((n) => <option key={n} value={n}>{n} cards</option>)}
              </select>
            </Field>
          )}
          <div className="font-mono" style={{ marginTop: 10, fontSize: 9, lineHeight: 1.8, background: "rgba(29,25,19,.07)", borderRadius: 8, padding: "8px 10px" }}>
            🔒 LIVE DATA BLOCK — figures, listings, and attribution come from the canonical pipelines and cannot be edited here.
          </div>
        </>
      )}
      {fullBleed && (
        <div className="font-mono" style={{ marginTop: 10, fontSize: 9, lineHeight: 1.8, background: "rgba(29,25,19,.07)", borderRadius: 8, padding: "8px 10px" }}>
          🔒 PROTECTED SITE COMPONENT — renders the real thing (data + plumbing locked). Placement and visibility only.
        </div>
      )}

      {/* ---- shared style + visibility ---- */}
      {!fullBleed && (
        <>
          <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: "rgba(29,25,19,.55)", marginTop: 18 }}>SECTION TREATMENT</div>
          <Field label="BACKGROUND">
            <select value={block.style.treatment} onChange={(e) => onStyle({ treatment: e.target.value as (typeof TREATMENTS)[number] })} style={selStyle}>
              {TREATMENTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="WIDTH">
            <select value={block.style.width} onChange={(e) => onStyle({ width: e.target.value as (typeof WIDTHS)[number] })} style={selStyle}>
              {WIDTHS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ALIGNMENT">
            <select value={block.style.align} onChange={(e) => onStyle({ align: e.target.value as (typeof ALIGNS)[number] })} style={selStyle}>
              {ALIGNS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="SPACING">
            <select value={block.style.spacing} onChange={(e) => onStyle({ spacing: e.target.value as (typeof SPACINGS)[number] })} style={selStyle}>
              {SPACINGS.map((t) => <option key={t} value={t}>{t === "sm" ? "Small" : t === "md" ? "Medium" : "Large"}</option>)}
            </select>
          </Field>
        </>
      )}
      <Field label="DEVICE VISIBILITY">
        <select value={block.visibility} onChange={(e) => onMeta({ visibility: e.target.value as (typeof VISIBILITIES)[number] })} style={selStyle}>
          {VISIBILITIES.map((v) => <option key={v} value={v}>{v === "all" ? "All devices" : v === "desktop" ? "Desktop only" : "Mobile only"}</option>)}
        </select>
      </Field>
    </div>
  );
}

/* ======================================================== nav editor */
function NavEditor({ items, customPages, onChange }: { items: NavItem[]; customPages: { slug: string; title: string; status: string; nav_label: string | null }[]; onChange: (items: NavItem[]) => void }) {
  const displayed = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);
  const move = (key: string, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.key === key);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= items.length) return;
    onChange(arrayMove(items, idx, to));
  };
  const publishedPages = customPages.filter((p) => p.status === "published" && !items.some((i) => i.href === `/${p.slug}`));

  const row = (i: NavItem) => (
    <div key={i.key} style={{ display: "flex", gap: 8, alignItems: "center", border: `1.5px solid ${INK}`, borderRadius: 10, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
      <button type="button" onClick={() => move(i.key, -1)} aria-label={`Move ${i.label} up`} style={{ border: "none", background: "none", cursor: "pointer" }}>↑</button>
      <button type="button" onClick={() => move(i.key, 1)} aria-label={`Move ${i.label} down`} style={{ border: "none", background: "none", cursor: "pointer" }}>↓</button>
      <input value={i.label} aria-label={`${i.key} label`} onChange={(e) => onChange(items.map((x) => (x.key === i.key ? { ...x, label: e.target.value.toUpperCase() } : x)))} style={{ ...inputStyle, width: 160, fontFamily: "inherit" }} />
      <span className="font-mono" style={{ flex: 1, fontSize: 9.5, color: "rgba(29,25,19,.55)" }}>{i.href} {i.kind === "system" && "· 🔒 destination"}</span>
      {!(i.kind === "system" && i.key === "search") ? (
        <button type="button" className="font-mono" onClick={() => onChange(items.map((x) => (x.key === i.key ? { ...x, hidden: !x.hidden } : x)))} style={btn()}>
          {i.hidden ? "SHOW" : "HIDE"}
        </button>
      ) : (
        <span className="font-mono" style={{ fontSize: 8.5 }}>ALWAYS SHOWN</span>
      )}
      {i.kind !== "system" && (
        <button type="button" className="font-mono" onClick={() => onChange(items.filter((x) => x.key !== i.key))} style={btn(false, true)}>✕</button>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h2 className="font-serif" style={{ fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Site navigation</h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(29,25,19,.7)", margin: "0 0 18px" }}>
        Reorder with the arrows, rename labels, hide eligible items, and add links to published builder pages. System destinations are locked; publishing updates the header for every visitor.
      </p>
      <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".18em", color: ORANGE_DARK, margin: "14px 0 8px" }}>DISPLAYED NAVIGATION</div>
      {displayed.map(row)}
      <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "18px 0 8px" }}>HIDDEN NAVIGATION</div>
      {hidden.length === 0 && <div className="font-mono" style={{ fontSize: 9.5, color: "rgba(29,25,19,.5)", marginBottom: 8 }}>NOTHING HIDDEN.</div>}
      {hidden.map(row)}
      {publishedPages.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", marginBottom: 8 }}>ADD A PUBLISHED PAGE</div>
          {publishedPages.map((p) => (
            <button
              key={p.slug}
              type="button"
              className="font-mono"
              style={{ ...btn(), marginRight: 8, marginBottom: 8 }}
              onClick={() => onChange([...items, { key: `page-${p.slug}`, label: (p.nav_label || p.title).toUpperCase().slice(0, 24), href: `/${p.slug}`, kind: "page", hidden: false }])}
            >
              + {p.title.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================= small modals */
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(29,25,19,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: CREAM, border: `3px solid ${INK}`, borderRadius: 14, padding: "18px 20px 20px", width: wide ? "min(860px, 94vw)" : "min(520px, 94vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".2em", color: ORANGE_DARK, marginBottom: 10 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function NewPageModal({ busy, onClose, onCreate }: { busy: string | null; onClose: () => void; onCreate: (title: string, slug: string, template: string) => Promise<string | null> }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState("blank");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="NEW PAGE" onClose={onClose}>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(29,25,19,.7)", marginTop: 0 }}>
        New pages start as DRAFTS: 404 + noindex for visitors, out of the sitemap and navigation, until you publish.
      </p>
      <Field label="PAGE NAME"><input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")); }} style={inputStyle} /></Field>
      <Field label="URL SLUG (/your-slug)"><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} style={inputStyle} /></Field>
      <Field label="TEMPLATE">
        <select value={template} onChange={(e) => setTemplate(e.target.value)} style={selStyle}>
          {PAGE_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      {error && <div className="font-mono" style={{ marginTop: 10, fontSize: 10, color: CREAM, background: ORANGE_DARK, borderRadius: 8, padding: "8px 10px" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" className="font-mono" disabled={busy !== null} style={{ ...btn(true), flex: 1 }} onClick={async () => { const err = await onCreate(title.trim(), slug.trim(), template); setError(err); }}>
          {busy === "create" ? "CREATING…" : "CREATE DRAFT PAGE"}
        </button>
        <button type="button" className="font-mono" style={{ ...btn(), flex: 1 }} onClick={onClose}>CANCEL</button>
      </div>
    </Modal>
  );
}

function PageSettingsModal({
  page,
  busy,
  onClose,
  onSave,
  onUnpublish,
}: {
  page?: { slug: string; title: string; status: string; seo_title: string | null; seo_description: string | null; og_image_url: string | null; nav_label: string | null; show_in_nav: boolean; header_footer: boolean };
  busy: string | null;
  onClose: () => void;
  onSave: (s: Record<string, unknown>) => void;
  onUnpublish: () => void;
}) {
  const [title, setTitle] = useState(page?.title ?? "");
  const [seoTitle, setSeoTitle] = useState(page?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(page?.seo_description ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(page?.og_image_url ?? "");
  const [navLabel, setNavLabel] = useState(page?.nav_label ?? "");
  const [showInNav, setShowInNav] = useState(page?.show_in_nav ?? false);
  const [headerFooter, setHeaderFooter] = useState(page?.header_footer ?? true);
  if (!page) return null;
  return (
    <Modal title={`PAGE SETTINGS — /${page.slug}`} onClose={onClose}>
      <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.9, color: "rgba(29,25,19,.6)" }}>
        STATUS: {page.status.toUpperCase()} · CANONICAL (read-only): https://www.discoverdfw.com/{page.slug}
      </div>
      <Field label="PAGE NAME"><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></Field>
      <Field label="SEO TITLE"><input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} style={inputStyle} /></Field>
      <div className="font-mono" style={{ fontSize: 9, color: seoTitle.length > 70 ? ORANGE_DARK : "rgba(29,25,19,.5)" }}>{seoTitle.length}/70</div>
      <Field label="META DESCRIPTION"><textarea value={seoDescription} rows={2} onChange={(e) => setSeoDescription(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} /></Field>
      <div className="font-mono" style={{ fontSize: 9, color: seoDescription.length > 165 ? ORANGE_DARK : "rgba(29,25,19,.5)" }}>{seoDescription.length}/165</div>
      <Field label="SOCIAL SHARE IMAGE URL (editorial-photos bucket or /images)"><input value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} style={inputStyle} /></Field>
      <Field label="NAVIGATION LABEL"><input value={navLabel} onChange={(e) => setNavLabel(e.target.value)} style={inputStyle} /></Field>
      <Field label="SHOW IN NAVIGATION (via the Site navigation editor)">
        <select value={showInNav ? "yes" : "no"} onChange={(e) => setShowInNav(e.target.value === "yes")} style={selStyle}>
          <option value="no">Hidden from navigation</option>
          <option value="yes">Eligible for navigation</option>
        </select>
      </Field>
      <Field label="HEADER / FOOTER">
        <select value={headerFooter ? "yes" : "no"} onChange={(e) => setHeaderFooter(e.target.value === "yes")} style={selStyle}>
          <option value="yes">Show site header + footer</option>
          <option value="no">Bare page (landing style)</option>
        </select>
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" className="font-mono" disabled={busy !== null} style={{ ...btn(true), flex: 1 }} onClick={() => onSave({ title, seoTitle, seoDescription, ogImageUrl, navLabel, showInNav, headerFooter })}>
          {busy === "settings" ? "SAVING…" : "SAVE SETTINGS"}
        </button>
        {page.status === "published" && (
          <button type="button" className="font-mono" disabled={busy !== null} style={{ ...btn(false, true), flex: 1 }} onClick={onUnpublish}>
            UNPUBLISH…
          </button>
        )}
        <button type="button" className="font-mono" style={{ ...btn(), flex: 1 }} onClick={onClose}>CLOSE</button>
      </div>
    </Modal>
  );
}

/* ===================================================== editor's picks */
/** right-panel editor for ONE homepage pick card. City name, county,
    median, and the destination URL stay canonical site data — only the
    city CHOICE and the short tagline override are editable here. */
function PickCardPanel({
  index,
  picks,
  info,
  onLoadInfo,
  onPicks,
  onSelectCard,
  onChangePhoto,
  onRefuse,
}: {
  index: number;
  picks: PickCard[];
  info: Record<string, PickPhotoInfo | null>;
  onLoadInfo: (city: string) => void | Promise<void>;
  onPicks: (next: PickCard[]) => void;
  onSelectCard: (i: number) => void;
  onChangePhoto: (city: string) => void;
  onRefuse: (text: string) => void;
}) {
  const pick = picks[index];
  const pickCity = pick?.city;
  const [cityQuery, setCityQuery] = useState("");
  useEffect(() => {
    if (pickCity) void onLoadInfo(pickCity);
    setCityQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickCity]);
  if (!pick) return null;
  const c = bySlug[pick.city];
  const ph = info[pick.city];
  const q = cityQuery.trim().toLowerCase();
  const matches = q ? cities.filter((x) => x.name.toLowerCase().includes(q) && x.slug !== pick.city).slice(0, 8) : [];

  const swap = (dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= picks.length) return;
    const next = [...picks];
    [next[index], next[to]] = [next[to], next[index]];
    onPicks(next);
    onSelectCard(to);
  };

  return (
    <div>
      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>
        EDITOR&rsquo;S PICK — CARD {index + 1} OF {picks.length}
      </div>
      <div className="font-serif" style={{ fontWeight: 900, fontSize: 24, marginTop: 6 }}>{c?.name ?? pick.city}</div>
      <div className="font-mono" style={{ fontSize: 10, color: "rgba(29,25,19,.55)", marginTop: 2 }}>
        MEDIAN, COUNTY &amp; LINK COME FROM CANONICAL CITY DATA
      </div>

      <Field label="POSITION">
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="font-mono" onClick={() => swap(-1)} disabled={index === 0} style={{ ...btn(), opacity: index === 0 ? 0.4 : 1 }}>◀ MOVE</button>
          <button type="button" className="font-mono" onClick={() => swap(1)} disabled={index === picks.length - 1} style={{ ...btn(), opacity: index === picks.length - 1 ? 0.4 : 1 }}>MOVE ▶</button>
          <span className="font-mono" style={{ fontSize: 9.5, color: "rgba(29,25,19,.5)" }}>or drag the card on the page</span>
        </div>
      </Field>

      <Field label="CITY (SEARCH THE CANONICAL DATASET)">
        <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder={`${c?.name ?? pick.city} — type to replace…`} style={inputStyle} />
        {matches.length > 0 && (
          <div style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, marginTop: 4, overflow: "hidden", background: "#fff" }}>
            {matches.map((x) => {
              const dup = picks.some((p, j) => j !== index && p.city === x.slug);
              return (
                <button
                  key={x.slug}
                  type="button"
                  onClick={() => {
                    if (dup) {
                      onRefuse(`"${x.name}" is already on another pick card — each card needs a different city.`);
                      return;
                    }
                    onPicks(picks.map((p, j) => (j === index ? { city: x.slug } : p)));
                    setCityQuery("");
                  }}
                  style={{ display: "flex", gap: 8, alignItems: "baseline", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid rgba(29,25,19,.1)", background: "transparent", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, opacity: dup ? 0.45 : 1 }}
                >
                  <span style={{ flex: 1 }}>{x.name}</span>
                  {dup && <span className="font-mono" style={{ fontSize: 8.5, color: ORANGE_DARK }}>ALREADY PICKED</span>}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="TAGLINE (EMPTY = THE CITY'S CANONICAL LINE)">
        <textarea
          value={pick.tagline ?? ""}
          maxLength={140}
          rows={2}
          placeholder={c?.tagline ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onPicks(picks.map((p, j) => (j === index ? { ...p, tagline: v || undefined } : p)));
          }}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <Field label="PHOTO (VIA THE PHOTO DESK — APPROVED ASSETS ONLY)">
        {ph === null || ph === undefined ? (
          <div className="font-mono" style={{ fontSize: 10, color: "rgba(29,25,19,.55)" }}>CHECKING THE PHOTO DESK…</div>
        ) : ph.asset ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.asset.public_image_url} alt={ph.asset.alt_text} style={{ width: "100%", borderRadius: 8, border: `1.5px solid ${INK}` }} />
            <div className="font-mono" style={{ fontSize: 9.5, marginTop: 5, color: "rgba(29,25,19,.65)", lineHeight: 1.7 }}>
              {ph.asset.attribution_text}
              <br />LICENSE: {ph.asset.license}
            </div>
          </div>
        ) : (
          <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.8, background: "rgba(193,62,23,.08)", border: `1.5px solid ${ORANGE_DARK}`, borderRadius: 8, padding: "8px 10px", color: ORANGE_DARK }}>
            NO APPROVED HOMEPAGE-PICK PHOTO FOR {(c?.name ?? pick.city).toUpperCase()}.
            <br />You can SAVE this lineup as a draft, but PUBLISH will refuse until a photo is approved.
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" className="font-mono" onClick={() => onChangePhoto(pick.city)} style={btn(true)}>CHANGE PHOTO…</button>
          <a href="/admin/photos" target="_blank" rel="noreferrer" className="font-mono" style={{ ...btn(), textDecoration: "none" }}>OPEN PHOTO DESK ↗</a>
        </div>
        {ph && ph.pendingCandidates > 0 && (
          <div className="font-mono" style={{ fontSize: 9.5, marginTop: 6, color: "#8a6d1a" }}>
            {ph.pendingCandidates} PENDING CANDIDATE{ph.pendingCandidates === 1 ? "" : "S"} AWAITING REVIEW IN THE PHOTO DESK
          </div>
        )}
      </Field>
    </div>
  );
}

/** CHANGE PHOTO — the Photo Desk data for one slot: the approved asset
    with its full metadata, or an honest empty state.

    Homepage picks: uploads ride the EXISTING CI-7 manual pipeline and only
    ever create a PENDING candidate — approval stays the Photo Desk's
    explicit action.

    Community Studio (entity=neighborhood): ONE-ACTION upload + approve —
    the same CI-7 processing composed with the same audited CI-6 approval
    RPC server-side (/api/admin/editor/upload-approve), so a studio upload
    no longer needs a Photo Desk visit. Alt text becomes REQUIRED (the
    photo publishes immediately). Sourced candidates (Wikimedia/Openverse/
    provider) still go through the Photo Desk — the one-action endpoint can
    only approve the manual upload it just created. */
export function PickPhotoModal({
  city,
  info,
  onClose,
  onRefresh,
  entity = "homepage",
  displayName,
  slotKey,
}: {
  /** homepage: a city slug · neighborhood: "city/slug" */
  city: string;
  info: PickPhotoInfo | null;
  onClose: () => void;
  onRefresh: () => void;
  entity?: "homepage" | "neighborhood";
  displayName?: string;
  /** neighborhood only: "hero" (default) or a "gallery-<i>" slot */
  slotKey?: string;
}) {
  const c = bySlug[entity === "neighborhood" ? city.split("/")[0] : city];
  const shown = displayName ?? c?.name ?? city;
  const galleryIdx = slotKey?.startsWith("gallery-") ? Number(slotKey.slice(8)) : null;
  const slotWord = entity === "neighborhood" ? (galleryIdx !== null ? `GALLERY ${galleryIdx + 1}` : "HERO") : "HOMEPAGE-PICK";
  const oneAction = entity === "neighborhood"; // studio: upload + audited approval in one request
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [attr, setAttr] = useState("PHOTO: DISCOVER DFW");
  const [caption, setCaption] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const upload = async () => {
    if (!file) return setNote({ kind: "error", text: "Choose an image file first." });
    if (oneAction && !altText.trim()) return setNote({ kind: "error", text: "Alt text is required — describe the photo for screen readers." });
    if (!attr.trim()) return setNote({ kind: "error", text: "Attribution is required." });
    if (!rights) return setNote({ kind: "error", text: "Confirm you have the right to use this photo." });
    setBusy(true);
    setNote(null);
    try {
      let slotId = info?.slot?.id;
      if (!slotId) {
        const j = await (await fetch("/api/admin/editor/pick-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entity === "neighborhood" ? { action: "ensure-slot", entity, key: city, name: displayName, slotKey: slotKey ?? "hero" } : { action: "ensure-slot", city }) })).json();
        if (!j.ok) throw new Error(String(j.error ?? "Could not create the photo slot"));
        slotId = j.slot.id as string;
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("slotId", slotId);
      fd.set("attributionText", attr.trim());
      fd.set("caption", caption.trim());
      fd.set("rightsConfirmed", "true");
      if (oneAction) fd.set("altText", altText.trim());
      const res = await fetch(oneAction ? "/api/admin/editor/upload-approve" : "/api/admin/photos/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!j.ok) throw new Error(String(j.error ?? "Upload failed"));
      setNote({
        kind: "ok",
        text: oneAction
          ? String(j.note ?? "PHOTO IS APPROVED AND READY.")
          : "Uploaded as a PENDING candidate — APPROVE it in the Photo Desk to make it publishable. Nothing on the site changes until then.",
      });
      setShowUpload(false);
      setFile(null);
      setAltText("");
      onRefresh();
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${entity === "neighborhood" ? (galleryIdx !== null ? `COMMUNITY GALLERY PHOTO ${galleryIdx + 1}` : "COMMUNITY HERO PHOTO") : "HOMEPAGE PICK PHOTO"} — ${shown.toUpperCase()}`} onClose={onClose} wide>
      {!info ? (
        <div className="font-mono" style={{ fontSize: 11 }}>LOADING THE PHOTO DESK RECORD…</div>
      ) : (
        <>
          {info.asset ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.asset.public_image_url} alt={info.asset.alt_text} style={{ width: "100%", borderRadius: 10, border: `2px solid ${INK}` }} />
              <div className="font-mono" style={{ fontSize: 10.5, lineHeight: 2 }}>
                <div style={{ fontWeight: 700, color: ORANGE_DARK }}>APPROVED ASSET — THE CARD USES THIS AUTOMATICALLY</div>
                <div>ATTRIBUTION: {info.asset.attribution_text}</div>
                <div>LICENSE: {info.asset.license}</div>
                <div>
                  SOURCE:{" "}
                  {info.asset.source_page_url ? (
                    <a href={info.asset.source_page_url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: ORANGE_DARK }}>
                      {info.asset.source_page_url.slice(0, 60)}…
                    </a>
                  ) : (
                    "manual upload"
                  )}
                </div>
                <div>ALT: {info.asset.alt_text}</div>
                <div>CAPTION: {info.asset.caption ?? "—"}</div>
                <div>APPROVED BY: {info.asset.approved_by}</div>
                <div>SIZE: {info.asset.width ?? "?"}×{info.asset.height ?? "?"}</div>
              </div>
            </div>
          ) : (
            <div className="font-mono" style={{ fontSize: 11, lineHeight: 1.9, background: "rgba(193,62,23,.08)", border: `1.5px solid ${ORANGE_DARK}`, borderRadius: 10, padding: "12px 14px", color: ORANGE_DARK }}>
              NO APPROVED {slotWord} PHOTO FOR {shown.toUpperCase()}.
              {oneAction ? (
                <>
                  <br />
                  {galleryIdx !== null
                    ? "OPTIONAL — the gallery renders only approved frames and hides publicly at zero."
                    : "REQUIRED FOR PUBLICATION — the community cannot PREPARE FOR EXPORT without it."}{" "}
                  Upload your own photo below and it approves in one step, or research/source one in the Photo Desk.
                </>
              ) : (
                <>
                  <br />Upload one below (it becomes a PENDING candidate) or research/approve in the Photo Desk. A lineup with this city can be drafted but never published until an asset is approved.
                </>
              )}
            </div>
          )}

          {info.pendingCandidates > 0 && (
            <div className="font-mono" style={{ fontSize: 10, marginTop: 10, color: "#8a6d1a" }}>
              {info.pendingCandidates} PENDING CANDIDATE{info.pendingCandidates === 1 ? "" : "S"} already awaiting review for this slot.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" className="font-mono" onClick={() => setShowUpload((v) => !v)} style={btn(!showUpload)}>
              {showUpload ? "CANCEL UPLOAD" : info.asset ? "UPLOAD REPLACEMENT…" : "UPLOAD PHOTO…"}
            </button>
            <a href="/admin/photos" target="_blank" rel="noreferrer" className="font-mono" style={{ ...btn(), textDecoration: "none" }}>
              OPEN PHOTO DESK ↗
            </a>
            <span style={{ flex: 1 }} />
            <button type="button" className="font-mono" onClick={onClose} style={btn()}>BACK TO BUILDER</button>
          </div>

          {showUpload && (
            <div style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 10, padding: "10px 12px", marginTop: 10 }}>
              <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
                {oneAction
                  ? "Same processing as the Photo Desk uploader: JPEG/PNG/WebP, ≥1200px wide, landscape, ≤4MB, EXIF stripped. Submitting uploads AND approves in one audited step — the photo publishes to this community's page immediately."
                  : "Same rules as the Photo Desk uploader: JPEG/PNG/WebP, ≥1200px wide, landscape, ≤4MB. The upload creates a PENDING candidate — publishing it stays the Photo Desk's explicit APPROVE action."}
              </div>
              <Field label="IMAGE FILE">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 12 }} />
              </Field>
              {oneAction && (
                <Field label="ALT TEXT (REQUIRED — DESCRIBE THE PHOTO)">
                  <input value={altText} maxLength={300} placeholder="e.g. New two-story homes along a Bridgewater street at dusk" onChange={(e) => setAltText(e.target.value)} style={inputStyle} />
                </Field>
              )}
              <Field label="ATTRIBUTION (SHOWN ON THE CARD)">
                <input value={attr} onChange={(e) => setAttr(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="CAPTION (OPTIONAL)">
                <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
              </Field>
              <label className="font-mono" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 10, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 2 }} />
                I confirm I own this image or have documented permission to publish it on DiscoverDFW.com.
              </label>
              <button type="button" className="font-mono" onClick={upload} disabled={busy} style={{ ...btn(true), marginTop: 10 }}>
                {busy
                  ? "UPLOADING…"
                  : oneAction
                    ? galleryIdx !== null
                      ? "UPLOAD & ADD TO GALLERY"
                      : "UPLOAD & USE AS HERO"
                    : "UPLOAD AS PENDING CANDIDATE"}
              </button>
            </div>
          )}

          {note && (
            <div className="font-mono" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.7, color: note.kind === "error" ? ORANGE_DARK : "rgba(29,25,19,.75)" }}>
              {note.text}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
