"use client";
/* Visual Builder — the Lofty-style block workspace on the 0018/0019 rails.

   Top toolbar : target selector · device widths · undo/redo · Save Draft ·
                 Preview Draft · Publish (diff + typed template confirm) ·
                 History · Page Settings · New Page
   Left panel  : Pages · Templates · Block Library · Structure
   Canvas      : the page's ordered entries — code sections (lock badges on
                 protected/required ones) and admin blocks, dnd-kit sortable
                 with keyboard reordering, inline text editing where the
                 field is plain text
   Right panel : settings for the selected entry (enum-only styling, media
                 picker, buttons, per-type content fields)

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
  BLOCK_DEFS,
  BLOCK_DEF_BY_TYPE,
  TEMPLATE_SECTIONS,
  SYSTEM_NAV,
  codeLayout,
  diffLayouts,
  TREATMENTS,
  WIDTHS,
  ALIGNS,
  SPACINGS,
  VISIBILITIES,
  type LayoutDoc,
  type LayoutEntry,
  type BlockInstance,
  type SectionDef,
  type NavItem,
  type BlockButton,
  type BlockImage,
} from "@/lib/editor/blocks.ts";
import { cities } from "@/lib/dfw-data";
import RichEditor, { type RichEditorHandle } from "./RichEditor";
import { MediaPicker, type MediaItem } from "./EditorDesk";

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
  { key: "desktop", label: "Desktop", width: 1200 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "mobile", label: "Mobile", width: 390 },
] as const;

const btn = (primary = false, danger = false): React.CSSProperties => ({
  border: `2px solid ${danger ? ORANGE_DARK : INK}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".1em",
  cursor: "pointer",
  background: primary ? ORANGE : danger ? "transparent" : CARD,
  color: primary ? CREAM : danger ? ORANGE_DARK : INK,
  whiteSpace: "nowrap",
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
      <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: "rgba(29,25,19,.6)" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

/* ============================================================== builder */
export default function VisualBuilder({ adminEmail }: { adminEmail: string }) {
  void adminEmail;
  const [customPages, setCustomPages] = useState<{ slug: string; title: string; status: string; template: string; seo_title: string | null; seo_description: string | null; og_image_url: string | null; nav_label: string | null; show_in_nav: boolean; header_footer: boolean }[]>([]);
  const [migrationApplied, setMigrationApplied] = useState<boolean | null>(null);
  const [target, setTarget] = useState<Target>(BASE_TARGETS[0]);
  const [entries, setEntries] = useState<LayoutEntry[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [publishedDoc, setPublishedDoc] = useState<LayoutDoc | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<{ versionNo: number; status: string; createdAt: string; createdBy: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [leftTab, setLeftTab] = useState<"pages" | "templates" | "blocks" | "structure">("pages");
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

  // undo/redo history of entries
  const historyRef = useRef<{ stack: LayoutEntry[][]; idx: number }>({ stack: [], idx: -1 });
  const pushHistory = useCallback((next: LayoutEntry[]) => {
    const h = historyRef.current;
    h.stack = h.stack.slice(0, h.idx + 1).concat([next]).slice(-50);
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
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx > 0) {
      h.idx -= 1;
      setEntries(h.stack[h.idx]);
      setDirty(true);
    }
  }, []);
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx < h.stack.length - 1) {
      h.idx += 1;
      setEntries(h.stack[h.idx]);
      setDirty(true);
    }
  }, []);

  const sections: SectionDef[] = useMemo(() => TEMPLATE_SECTIONS[target.route] ?? [], [target.route]);
  const sectionByKey = useMemo(() => new Map(sections.map((s) => [s.key, s])), [sections]);

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

  const loadTarget = useCallback(
    async (t: Target) => {
      setBusy("load");
      setMessage(null);
      setSelectedId(null);
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
          const working = (draft as LayoutDoc | undefined) ?? (published as LayoutDoc | undefined) ?? codeLayout(t.route);
          setEntries(working.blocks);
          setPublishedDoc((published as LayoutDoc | undefined) ?? null);
          historyRef.current = { stack: [working.blocks], idx: 0 };
        }
        setDirty(false);
      } catch {
        setMessage({ kind: "error", text: "Failed to load this page — try again." });
      } finally {
        setBusy(null);
      }
    },
    []
  );
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
      if (j.ok) {
        setMessage({ kind: "ok", text: `Draft saved as v${j.versionNo}` });
        setDirty(false);
        setBaseVersion(j.versionNo);
        setDraftVersion(j.versionNo);
      } else {
        setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Save failed" });
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
      if (j.ok) {
        setPublishOpen(false);
        setConfirmText("");
        setMessage({ kind: j.revalidated ? "ok" : "warn", text: String(j.note ?? "Published") });
        await Promise.all([loadTarget(target), loadCustomPages()]);
      } else {
        setMessage({ kind: "error", text: ((j.errors as string[]) ?? [j.error]).filter(Boolean).join(" · ") || "Publish failed" });
      }
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
    updateEntry(id, (e) => (e.kind === "block" ? { ...e, block: { ...e.block, ...patch } } : e));
  const updateSettings = (id: string, patch: Record<string, unknown>) =>
    updateEntry(id, (e) => (e.kind === "block" ? { ...e, block: { ...e.block, settings: { ...e.block.settings, ...patch } } } : e));

  const addBlock = (type: string) => {
    const b: LayoutEntry = { kind: "block", block: newBlock(type) };
    const idx = selected ? entries.findIndex((e) => entryId(e) === selectedId) + 1 : entries.length;
    const next = [...entries];
    next.splice(idx, 0, b);
    setLayout(next);
    setSelectedId(entryId(b));
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

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((e) => entryId(e) === active.id);
    const to = entries.findIndex((e) => entryId(e) === over.id);
    if (from < 0 || to < 0) return;
    setLayout(arrayMove(entries, from, to));
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
    () => diffLayouts(publishedDoc ?? (target.kind === "static" || target.kind === "template" ? codeLayout(target.route) : null), { type: "layout", blocks: entries }, sections),
    [publishedDoc, entries, sections, target]
  );

  const previewHref = target.kind === "nav" ? "/" : target.previewRoute ?? target.route;

  /* ============================================================ render */
  return (
    <div style={{ minHeight: "calc(100vh - 46px)", display: "flex", flexDirection: "column" }}>
      {/* ---------------------------------------------------- top toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 14px", borderBottom: `2px solid ${INK}`, background: CARD, position: "sticky", top: 0, zIndex: 50 }}>
        <select
          aria-label="Page"
          value={target.route}
          onChange={(e) => {
            const all = [...BASE_TARGETS, ...customPages.map<Target>((p) => ({ route: `/${p.slug}`, title: `${p.title} (${p.status})`, group: "My pages", kind: "custom", previewRoute: `/${p.slug}` }))];
            const t = all.find((x) => x.route === e.target.value);
            if (t) switchTarget(t);
          }}
          className="font-mono"
          style={{ ...selStyle, width: 300, fontSize: 11, fontWeight: 700 }}
        >
          {["Pages", "Templates", "Site", "My pages"].map((g) => (
            <optgroup key={g} label={g.toUpperCase()}>
              {[...BASE_TARGETS, ...customPages.map<Target>((p) => ({ route: `/${p.slug}`, title: `${p.title} (${p.status})`, group: "My pages", kind: "custom" }))]
                .filter((t) => t.group === g)
                .map((t) => (
                  <option key={t.route} value={t.route}>{t.title}</option>
                ))}
            </optgroup>
          ))}
        </select>

        <span style={{ display: "flex", gap: 4 }} role="group" aria-label="Device preview">
          {DEVICES.map((d) => (
            <button key={d.key} type="button" onClick={() => setDevice(d)} className="font-mono" style={{ ...btn(device.key === d.key), padding: "8px 10px" }} title={`${d.label} preview`}>
              {d.key === "desktop" ? "🖥" : d.key === "tablet" ? "▯" : "📱"}
            </button>
          ))}
        </span>
        <button type="button" onClick={undo} className="font-mono" style={btn()} title="Undo">↶</button>
        <button type="button" onClick={redo} className="font-mono" style={btn()} title="Redo">↷</button>

        <span style={{ flex: 1 }} />
        {message && (
          <span className="font-mono" role="status" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", maxWidth: 420, color: message.kind === "error" ? ORANGE_DARK : message.kind === "warn" ? "#8a6d1a" : "rgba(29,25,19,.7)" }}>
            {message.text}
          </span>
        )}
        <a
          href={`/api/admin/editor/preview?route=${encodeURIComponent(previewHref)}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono"
          style={{ ...btn(), textDecoration: "none", opacity: draftVersion ? 1 : 0.5, pointerEvents: draftVersion ? "auto" : "none" }}
        >
          PREVIEW ↗
        </a>
        <button type="button" onClick={saveDraft} disabled={busy !== null || migrationApplied === false} className="font-mono" style={btn()}>
          {busy === "save" ? "SAVING…" : "SAVE DRAFT"}
        </button>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          disabled={busy !== null || draftVersion == null || dirty}
          className="font-mono"
          style={{ ...btn(true), opacity: draftVersion == null || dirty ? 0.5 : 1 }}
          title={dirty ? "Save the draft first" : undefined}
        >
          PUBLISH…
        </button>
        <button type="button" onClick={() => setHistoryOpen(true)} className="font-mono" style={btn()}>HISTORY</button>
        {target.kind === "custom" && (
          <button type="button" onClick={() => setSettingsOpen(true)} className="font-mono" style={btn()}>PAGE SETTINGS</button>
        )}
        <button type="button" onClick={() => setNewPageOpen(true)} className="font-mono" style={btn()}>+ NEW PAGE</button>
      </div>

      {migrationApplied === false && (
        <div className="font-mono" style={{ padding: "10px 16px", background: INK, color: "#E88D6B", fontSize: 10, letterSpacing: ".08em", lineHeight: 1.7 }}>
          MIGRATION 0019 NOT APPLIED — layouts, navigation, and new pages are read-only until supabase/migrations/0019_visual_builder.sql runs. Every public page renders its code-owned composition.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 300px", flex: 1, minHeight: 0 }} className="ed-desk">
        {/* --------------------------------------------------- left panel */}
        <aside style={{ borderRight: `2px solid ${INK}`, background: CARD, overflowY: "auto" }}>
          <div style={{ display: "flex", borderBottom: `1.5px solid rgba(29,25,19,.25)` }}>
            {(["pages", "templates", "blocks", "structure"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setLeftTab(t)} className="font-mono" style={{ flex: 1, border: "none", borderBottom: leftTab === t ? `3px solid ${ORANGE}` : "3px solid transparent", background: "transparent", padding: "10px 4px", fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", color: leftTab === t ? INK : "rgba(29,25,19,.55)" }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ padding: "12px 12px 30px" }}>
            {leftTab === "pages" && (
              <>
                {(["Pages", "Site"] as const).map((g) => (
                  <div key={g}>
                    <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>{g.toUpperCase()}</div>
                    {BASE_TARGETS.filter((t) => t.group === g).map((t) => (
                      <TargetRow key={t.route} t={t} active={target.route === t.route} onPick={() => switchTarget(t)} />
                    ))}
                  </div>
                ))}
                <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>MY PAGES</div>
                {customPages.length === 0 && <div className="font-mono" style={{ fontSize: 9.5, color: "rgba(29,25,19,.5)" }}>None yet — + NEW PAGE.</div>}
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
            {leftTab === "templates" && (
              <>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(29,25,19,.7)" }}>
                  Shared templates drive EVERY page of their kind. Publishing one requires a typed confirmation.
                </p>
                {BASE_TARGETS.filter((t) => t.group === "Templates").map((t) => (
                  <TargetRow key={t.route} t={t} active={target.route === t.route} onPick={() => switchTarget(t)} />
                ))}
              </>
            )}
            {leftTab === "blocks" && target.kind !== "nav" && (
              <>
                {clipboard && (
                  <button type="button" className="font-mono" style={{ ...btn(true), width: "100%", marginBottom: 10 }} onClick={() => {
                    const copy: LayoutEntry = { kind: "block", block: { ...structuredClone(clipboard), id: uid() } };
                    setLayout([...entries, copy]);
                  }}>
                    📋 PASTE “{BLOCK_DEF_BY_TYPE.get(clipboard.type)?.label}”
                  </button>
                )}
                {(["Content", "Media", "Conversion", "Site data", "Structure"] as const).map((cat) => (
                  <div key={cat}>
                    <div className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.55)", margin: "10px 0 4px" }}>{cat.toUpperCase()}</div>
                    {BLOCK_DEFS.filter((b) => b.category === cat)
                      .filter((b) => (target.kind === "custom" ? b.onCustomPages : b.onTemplates))
                      .map((b) => (
                        <button key={b.type} type="button" onClick={() => addBlock(b.type)} title={b.description} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", border: `1.5px solid rgba(29,25,19,.3)`, background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                          <span style={{ flex: 1 }}>{b.label}</span>
                          {b.protectedBlock && <span title="Protected — plumbing/data locked">🔒</span>}
                          <span className="font-mono" style={{ fontSize: 12, color: ORANGE_DARK }}>+</span>
                        </button>
                      ))}
                  </div>
                ))}
              </>
            )}
            {leftTab === "structure" && target.kind !== "nav" && (
              <div>
                {entries.map((e, i) => {
                  const label = e.kind === "section" ? sectionByKey.get(e.key)?.label ?? e.key : BLOCK_DEF_BY_TYPE.get(e.block.type)?.label ?? e.block.type;
                  const hidden = e.kind === "section" ? e.hidden : e.block.hidden;
                  return (
                    <button key={entryId(e)} type="button" onClick={() => setSelectedId(entryId(e))} style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left", border: "none", background: selectedId === entryId(e) ? INK : "transparent", color: selectedId === entryId(e) ? CREAM : INK, borderRadius: 7, padding: "6px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: hidden ? 0.5 : 1 }}>
                      <span className="font-mono" style={{ fontSize: 9, opacity: 0.6 }}>{i + 1}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                      {e.kind === "section" && (sectionByKey.get(e.key)?.locked || sectionByKey.get(e.key)?.required) && <span>🔒</span>}
                      {hidden && <span className="font-mono" style={{ fontSize: 8 }}>HIDDEN</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ------------------------------------------------------- canvas */}
        <main style={{ overflowY: "auto", background: "#E9E0CC", padding: "22px 16px 80px" }}>
          {target.kind === "nav" ? (
            <NavEditor items={navItems} customPages={customPages} onChange={(items) => { setNavItems(items); setDirty(true); }} />
          ) : (
            <div style={{ width: "100%", maxWidth: device.width, margin: "0 auto", transition: "max-width .2s ease" }}>
              <div className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".18em", color: "rgba(29,25,19,.5)", marginBottom: 8, textAlign: "center" }}>
                {device.label.toUpperCase()} · {device.width}PX — CANVAS PREVIEW. “PREVIEW ↗” OPENS THE REAL PAGE WITH THIS DRAFT.
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={entries.map(entryId)} strategy={verticalListSortingStrategy}>
                  {entries.map((e) => (
                    <CanvasCard
                      key={entryId(e)}
                      entry={e}
                      def={e.kind === "section" ? sectionByKey.get(e.key) : undefined}
                      selected={selectedId === entryId(e)}
                      device={device.key}
                      onSelect={() => setSelectedId(entryId(e))}
                      onHide={() => toggleHidden(entryId(e))}
                      onDelete={() => removeEntry(entryId(e))}
                      onDuplicate={() => duplicate(entryId(e))}
                      onCopy={() => e.kind === "block" && setClipboard(structuredClone(e.block))}
                      onInline={(patch) => e.kind === "block" && updateSettings(e.block.id, patch)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </main>

        {/* --------------------------------------------------- right panel */}
        <aside style={{ borderLeft: `2px solid ${INK}`, background: CARD, overflowY: "auto", padding: "14px 14px 40px" }}>
          {target.kind === "nav" ? (
            <div className="font-mono" style={{ fontSize: 10, lineHeight: 2, color: "rgba(29,25,19,.7)" }}>
              NAVIGATION RULES
              <br />· system links keep their destinations
              <br />· SEARCH HOMES can’t be hidden
              <br />· only published builder pages + homepage anchors may be added
              <br />· admin/account/api/auth can never enter public nav
            </div>
          ) : !selected ? (
            <div className="font-mono" style={{ fontSize: 10, lineHeight: 2, color: "rgba(29,25,19,.6)" }}>
              SELECT A BLOCK OR SECTION ON THE CANVAS.
              <br />
              <br />
              PUBLISHED: {publishedDoc ? "layout override" : target.kind === "custom" ? "—" : "code-owned layout"}
              <br />
              DRAFT: {draftVersion ? `v${draftVersion}` : "—"}
              {dirty && (
                <>
                  <br />
                  <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>UNSAVED CHANGES</span>
                </>
              )}
            </div>
          ) : selected.kind === "section" ? (
            <SectionSettings entry={selected} def={selectedSection} onChange={(patch) => updateEntry(selectedId!, (e) => (e.kind === "section" ? { ...e, ...patch } : e))} />
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

      {/* ------------------------------------------------- publish modal */}
      {publishOpen && (
        <Modal title={target.kind === "template" ? "PUBLISH SHARED TEMPLATE" : target.kind === "nav" ? "PUBLISH NAVIGATION" : "PUBLISH PAGE LAYOUT"} onClose={() => setPublishOpen(false)}>
          {target.kind !== "nav" && (
            <div className="font-mono" style={{ fontSize: 10.5, lineHeight: 2 }}>
              {diff.added.length > 0 && <div>➕ ADDED: {diff.added.join(" · ")}</div>}
              {diff.removed.length > 0 && <div>➖ REMOVED: {diff.removed.join(" · ")}</div>}
              {diff.moved.length > 0 && <div>↕ MOVED: {diff.moved.join(" · ")}</div>}
              {diff.hidden.length > 0 && <div>🚫 HIDDEN: {diff.hidden.join(" · ")}</div>}
              {diff.shown.length > 0 && <div>👁 SHOWN AGAIN: {diff.shown.join(" · ")}</div>}
              {diff.edited.length > 0 && <div>✏ EDITED: {diff.edited.join(" · ")}</div>}
              {!diff.added.length && !diff.removed.length && !diff.moved.length && !diff.hidden.length && !diff.shown.length && !diff.edited.length && (
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
            <button type="button" onClick={publish} disabled={busy !== null || (target.kind === "template" && confirmText !== "PUBLISH TEMPLATE")} className="font-mono" style={{ ...btn(true), flex: 1, opacity: target.kind === "template" && confirmText !== "PUBLISH TEMPLATE" ? 0.5 : 1 }}>
              {busy === "publish" ? "PUBLISHING…" : `CONFIRM — PUBLISH v${draftVersion}`}
            </button>
            <button type="button" onClick={() => setPublishOpen(false)} className="font-mono" style={{ ...btn(), flex: 1 }}>CANCEL</button>
          </div>
        </Modal>
      )}

      {/* ------------------------------------------------- history modal */}
      {historyOpen && (
        <Modal title="VERSION HISTORY" onClose={() => setHistoryOpen(false)}>
          {versions.length === 0 && <div className="font-mono" style={{ fontSize: 10 }}>NO VERSIONS YET — THIS LAYOUT IS PURE CODE.</div>}
          {versions.map((v) => (
            <div key={v.versionNo} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
              <div className="font-mono" style={{ fontSize: 10, fontWeight: 700 }}>v{v.versionNo} · {v.status.toUpperCase()}</div>
              <div className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.6)" }}>{new Date(v.createdAt).toLocaleString()} · {v.createdBy}</div>
              {v.status !== "published" && v.status !== "draft" && (
                <button
                  type="button"
                  className="font-mono"
                  style={{ marginTop: 6, border: "none", background: "none", color: ORANGE_DARK, fontSize: 9.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
                  onClick={async () => {
                    if (target.kind === "template" && !window.confirm("Rolling back republishes this version on EVERY page using the template. Continue?")) return;
                    setBusy("rollback");
                    const j = await post("/api/admin/editor/rollback", { route: target.route, regionKey: target.kind === "nav" ? "nav" : "__layout", targetVersionNo: v.versionNo });
                    setBusy(null);
                    setHistoryOpen(false);
                    setMessage(j.ok ? { kind: "ok", text: `Rolled back — v${j.publishedVersion} is live` } : { kind: "error", text: String(j.error ?? "Rollback failed") });
                    if (j.ok) loadTarget(target);
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
              style={{ ...btn(false, true), width: "100%", marginTop: 6 }}
              onClick={async () => {
                if (!window.confirm("Restore the code-owned layout? The published override is cleared; history stays.")) return;
                setBusy("restore");
                const j = await post("/api/admin/editor/restore", { route: target.route, regionKey: "__layout" });
                setBusy(null);
                setHistoryOpen(false);
                setMessage(j.ok ? { kind: "ok", text: "Code layout restored" } : { kind: "error", text: String(j.error ?? "Restore failed") });
                if (j.ok) loadTarget(target);
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

/* ================================================================ cards */
function TargetRow({ t, active, onPick }: { t: Target; active: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: active ? INK : "transparent", color: active ? CREAM : INK, borderRadius: 7, padding: "7px 9px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 2 }}>
      {t.title}
    </button>
  );
}

function CanvasCard({
  entry,
  def,
  selected,
  device,
  onSelect,
  onHide,
  onDelete,
  onDuplicate,
  onCopy,
  onInline,
}: {
  entry: LayoutEntry;
  def?: SectionDef;
  selected: boolean;
  device: "desktop" | "tablet" | "mobile";
  onSelect: () => void;
  onHide: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onInline: (patch: Record<string, unknown>) => void;
}) {
  const id = entryId(entry);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const isSection = entry.kind === "section";
  const hidden = isSection ? entry.hidden : entry.block.hidden;
  const visibility = isSection ? entry.visibility : entry.block.visibility;
  const lockish = isSection && (def?.locked || def?.required);
  const deviceHidden = (visibility === "desktop" && device === "mobile") || (visibility === "mobile" && device !== "mobile");

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.6 : hidden || deviceHidden ? 0.45 : 1,
        marginBottom: 10,
        position: "relative",
        outline: selected ? `3px solid ${ORANGE}` : "1.5px solid rgba(29,25,19,.3)",
        outlineOffset: 0,
        borderRadius: 12,
        background: "#fff",
        cursor: "pointer",
      }}
      onClick={onSelect}
    >
      {/* admin control strip — never part of public HTML */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid rgba(29,25,19,.12)", background: lockish ? "rgba(29,25,19,.06)" : CARD, borderRadius: "12px 12px 0 0" }}>
        <button type="button" className="font-mono" {...attributes} {...listeners} aria-label="Drag to reorder (space to lift, arrows to move)" title="Drag to reorder" style={{ cursor: "grab", border: "none", background: "none", fontSize: 13, padding: "2px 4px" }} onClick={(e) => e.stopPropagation()}>
          ⠿
        </button>
        <span className="font-mono" style={{ flex: 1, fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "rgba(29,25,19,.75)" }}>
          {isSection ? def?.label?.toUpperCase() ?? entry.key.toUpperCase() : (BLOCK_DEF_BY_TYPE.get(entry.block.type)?.label ?? entry.block.type).toUpperCase()}
        </span>
        {lockish && (
          <span className="font-mono" title={def?.description ?? (def?.required ? "Required — carries the page H1, search, or compliance content" : "Protected — live data / plumbing")} style={{ fontSize: 9 }}>
            🔒 {def?.required ? "REQUIRED" : "PROTECTED"}
          </span>
        )}
        {!isSection && BLOCK_DEF_BY_TYPE.get(entry.block.type)?.protectedBlock && (
          <span className="font-mono" title="Protected block — data and plumbing are locked; placement and safe settings only" style={{ fontSize: 9 }}>🔒</span>
        )}
        {!lockish && (
          <button type="button" className="font-mono" onClick={(e) => { e.stopPropagation(); onHide(); }} title={hidden ? "Show" : "Hide"} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11 }}>
            {hidden ? "🚫" : "👁"}
          </button>
        )}
        {!isSection && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11 }}>⧉</button>
            <button type="button" className="font-mono" onClick={(e) => { e.stopPropagation(); onCopy(); }} title="Copy (paste on any page)" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10 }}>📋</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this block?")) onDelete(); }} title="Delete" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: ORANGE_DARK }}>✕</button>
          </>
        )}
      </div>
      <div style={{ padding: 14 }}>
        {isSection ? (
          <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
            {def?.description ?? "Code-owned section — renders the real site component on the live page and in Preview."}
          </div>
        ) : (
          <BlockCanvasPreview block={entry.block} onInline={onInline} />
        )}
      </div>
    </div>
  );
}

/* stylized in-canvas previews with inline editing for plain-text fields */
function BlockCanvasPreview({ block, onInline }: { block: BlockInstance; onInline: (patch: Record<string, unknown>) => void }) {
  const s = block.settings as Record<string, unknown>;
  const onInk = block.style.treatment === "ink" || block.style.treatment === "orange";
  const bg = block.style.treatment === "ink" ? INK : block.style.treatment === "orange" ? ORANGE : block.style.treatment === "white" ? CARD : CREAM;
  const fg = onInk ? CREAM : INK;
  const inline = (field: string, value: unknown, big = false) => (
    <input
      value={String(value ?? "")}
      onChange={(e) => onInline({ [field]: e.target.value })}
      onClick={(e) => e.stopPropagation()}
      placeholder={field}
      aria-label={`${block.type} ${field}`}
      style={{ width: "100%", border: "1px dashed rgba(127,127,127,.4)", borderRadius: 6, background: "transparent", color: "inherit", fontFamily: big ? "inherit" : undefined, fontSize: big ? 22 : 13, fontWeight: big ? 800 : 400, padding: "4px 6px" }}
    />
  );

  const wrap = (children: React.ReactNode) => (
    <div style={{ background: bg, color: fg, borderRadius: 10, padding: "16px 18px" }}>{children}</div>
  );

  switch (block.type) {
    case "hero":
      return wrap(
        <>
          <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".2em", color: onInk ? "#E88D6B" : ORANGE_DARK, marginBottom: 6 }}>{String(s.kicker ?? "") || "KICKER"}</div>
          {inline("heading", s.heading, true)}
          <div style={{ marginTop: 6 }}>{inline("sub", s.sub)}</div>
          <div className="font-mono" style={{ marginTop: 8, fontSize: 8.5, opacity: 0.6 }}>{((s.buttons as BlockButton[]) ?? []).map((b) => b.label).join(" · ") || "no buttons"} · {String(s.level).toUpperCase()}</div>
        </>
      );
    case "richtext": {
      const first = ((s.doc as { content?: { content?: { text?: string }[] }[] })?.content ?? [])
        .flatMap((n) => n.content ?? [])
        .map((t) => t.text ?? "")
        .join(" ")
        .slice(0, 220);
      return wrap(<div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>{first || "Rich text — edit in the right panel."}</div>);
    }
    case "cta":
      return wrap(
        <>
          {inline("heading", s.heading, true)}
          <div style={{ marginTop: 6 }}>{inline("body", s.body)}</div>
          <div className="font-mono" style={{ marginTop: 8, fontSize: 8.5, opacity: 0.6 }}>{((s.buttons as BlockButton[]) ?? []).map((b) => `[${b.label}]`).join(" ") || "no buttons"}</div>
        </>
      );
    case "quote":
      return wrap(
        <>
          <div style={{ fontStyle: "italic" }}>{inline("text", s.text, true)}</div>
          <div style={{ marginTop: 6 }}>{inline("cite", s.cite)}</div>
        </>
      );
    case "image":
    case "editorialPhoto": {
      const im = s.image as BlockImage | null;
      return wrap(
        im?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={im.src} alt={im.alt} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8 }} />
        ) : (
          <div className="font-mono" style={{ fontSize: 10, opacity: 0.6, padding: "20px 0", textAlign: "center" }}>NO IMAGE — CHOOSE ONE IN THE RIGHT PANEL</div>
        )
      );
    }
    case "imageText": {
      const im = s.image as BlockImage | null;
      return wrap(
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 90, height: 64, borderRadius: 6, background: "rgba(127,127,127,.2)", overflow: "hidden", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {im?.src && <img src={im.src} alt={im.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Image + rich text · image {String(s.imageSide)}</div>
        </div>
      );
    }
    case "gallery": {
      const imgs = (s.images as BlockImage[]) ?? [];
      return wrap(
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {imgs.length === 0 && <span className="font-mono" style={{ fontSize: 10, opacity: 0.6 }}>EMPTY GALLERY</span>}
          {imgs.map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={im.src} alt={im.alt} style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6 }} />
          ))}
        </div>
      );
    }
    case "faq": {
      const items = (s.items as { q: string }[]) ?? [];
      return wrap(<div style={{ fontSize: 12.5, opacity: 0.85 }}>FAQ · {items.length} item{items.length === 1 ? "" : "s"}: {items.map((i) => i.q).join(" · ").slice(0, 140)}</div>);
    }
    case "featureGrid": {
      const items = (s.items as { title: string }[]) ?? [];
      return wrap(<div style={{ fontSize: 12.5, opacity: 0.85 }}>Feature grid ({String(s.columns)} col): {items.map((i) => i.title).join(" · ").slice(0, 140)}</div>);
    }
    case "statsBand": {
      const items = (s.items as { value: string; label: string }[]) ?? [];
      return wrap(
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {items.map((it, i) => (
            <div key={i}><span className="font-serif" style={{ fontWeight: 900, fontSize: 22 }}>{it.value}</span> <span className="font-mono" style={{ fontSize: 8.5, opacity: 0.6 }}>{it.label.toUpperCase()}</span></div>
          ))}
        </div>
      );
    }
    case "divider":
      return wrap(<div style={{ height: 2, background: "currentColor", opacity: 0.7 }} />);
    case "spacer":
      return wrap(<div className="font-mono" style={{ fontSize: 9, opacity: 0.6, textAlign: "center" }}>SPACER · {String(s.size).toUpperCase()}</div>);
    case "searchPromo":
      return wrap(
        <>
          {inline("heading", s.heading, true)}
          <div className="font-mono" style={{ marginTop: 6, fontSize: 8.5, opacity: 0.6 }}>→ {String(s.target)} · 🔒 the search itself lives on that page</div>
        </>
      );
    default: {
      const def = BLOCK_DEF_BY_TYPE.get(block.type);
      return wrap(
        <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.8, opacity: 0.75 }}>
          🔒 {def?.label?.toUpperCase()} — {def?.description ?? "protected block"} Renders live on the real page and in Preview.
        </div>
      );
    }
  }
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
