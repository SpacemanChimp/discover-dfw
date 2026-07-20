"use client";

/* The Letter Desk (TL-3) — the visual Sunday issue builder over the
   TL-2 rails. Three zones for block documents: navigator (layers) ·
   email preview iframe (the SAVED row) · block inspector. Legacy flat
   drafts get a one-click UPGRADE (action: convert); sent/canceled
   legacy issues keep their original format forever. NOTHING auto-sends:
   SAVE/READY are draft states, TEST SEND goes only to the signed-in
   admin on an explicit click, and the real send still demands the typed
   phrase SEND <issue-date>. No autosave — only SAVE DRAFT talks to the
   server; undo/redo is a session-local snapshot stack. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Undo2,
  Redo2,
  History,
  Send,
  Mail,
  Monitor,
  Smartphone,
  FileText,
  X,
} from "lucide-react";
import type { LetterIssue, IssueLint } from "@/lib/content/letter-issues";
import type { IssueStats } from "@/lib/email/letter-issue";
import type { PageOption } from "@/lib/content/community-content-drafts";
import type { PMNode } from "@/lib/editor/doc";
import {
  LETTER_BLOCK_TYPES,
  LETTER_BLOCK_LABELS,
  LOCKED_CONTENT_TYPES,
  isLetterDoc,
  defaultLetterDoc,
  type LetterDoc,
  type LetterBlock,
} from "@/lib/email/letter-blocks";
import RichEditor, { type RichEditorHandle } from "@/components/admin/editor/RichEditor";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";
const GREEN = "#2c6e49";

const CANVAS_H = 620;

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
const areaStyle: React.CSSProperties = { ...inputStyle, minHeight: 90, resize: "vertical" };

const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: `2px solid ${danger ? ORANGE_DARK : INK}`,
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: ".07em",
  cursor: "pointer",
  background: primary ? ORANGE : danger ? "transparent" : CARD,
  color: primary ? CREAM : danger ? ORANGE_DARK : INK,
  whiteSpace: "nowrap",
});

const smallBtn = (active = false): React.CSSProperties => ({
  border: `1.5px solid ${INK}`,
  borderRadius: 7,
  padding: "4px 9px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: ".08em",
  cursor: "pointer",
  background: active ? INK : "#fff",
  color: active ? CREAM : INK,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
});

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "rgba(29,25,19,.6)" }}>{label}</span>
      {hint && <span className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.45)", marginLeft: 8 }}>{hint}</span>}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

/* ------------------------------------------------------------- types */

type Counts = { subscribed: number; pending: number; unsubscribed: number };

/** sections_json is untyped jsonb — a row may hold the legacy flat shape
    OR a block LetterDoc; the desk narrows with isLetterDoc at runtime */
type DeskIssue = Omit<LetterIssue, "sections"> & { sections: unknown };

type DeskBlock = LetterBlock & { hidden?: boolean };
type BlockType = (typeof LETTER_BLOCK_TYPES)[number];

type Snap = { doc: LetterDoc; subject: string };

type VersionRow = { versionNo: number; status: string; subject: string | null; admin: string; at: string };

type ApiResp = {
  ok: boolean;
  error?: string;
  errors?: string[];
  issueId?: string;
  issueDate?: string;
  stats?: IssueStats;
  regenerated?: boolean;
  lint?: IssueLint;
  versionNo?: number | null;
  versionError?: string | null;
  doc?: LetterDoc;
  already?: boolean;
  subject?: string | null;
  html?: string;
  text?: string;
  versions?: VersionRow[];
  restoredFrom?: number;
  newVersionNo?: number | null;
  to?: string;
  dryRun?: boolean;
  sent?: number;
  failed?: number;
  skippedAlreadySent?: number;
};

/* ----------------------------------------------------------- helpers */

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = () => "blk-" + Math.random().toString(36).slice(2, 8);
const emptyRich = (): PMNode => ({ type: "doc", content: [{ type: "paragraph" }] });

/** only-one-allowed block types (the sanitizer rejects duplicates) */
const SINGLETONS = new Set<string>(["masthead", "week-in-numbers", "market-movers", "social"]);

const LOCKED_NOTE = "Content is code-owned — the letter renders this from canonical data.";

function freshBlock(type: BlockType): DeskBlock {
  const id = newId();
  switch (type) {
    case "masthead": return { id, type };
    case "editors-note": return { id, type, doc: emptyRich() };
    case "richtext": return { id, type, doc: emptyRich() };
    case "heading": return { id, type, text: "", level: 2 };
    case "image": return { id, type, src: "", alt: "", caption: "", attribution: "", href: "" };
    case "stat-strip": return { id, type, items: [{ value: "", label: "" }], note: "" };
    case "week-in-numbers": return { id, type };
    case "market-movers": return { id, type, count: 5 };
    case "community-spotlight": return { id, type, citySlug: "", hoodSlug: "", name: "", blurb: "" };
    case "listing-spotlight": return { id, type, listingKey: "", headline: "", note: "" };
    case "cta": return { id, type, label: "", href: "/" };
    case "divider": return { id, type };
    case "spacer": return { id, type, size: "md" };
    case "social": return { id, type };
  }
}

function StatusChip({ status, sentCount, failedCount }: { status: DeskIssue["status"]; sentCount: number; failedCount: number }) {
  const color = status === "ready" ? ORANGE : status === "sent" ? GREEN : status === "canceled" ? "rgba(29,25,19,.45)" : INK;
  return (
    <span className="font-mono" style={{ border: `1.5px solid ${color}`, color, borderRadius: 999, padding: "2px 9px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", whiteSpace: "nowrap" }}>
      {status.toUpperCase()}
      {status === "sent" ? ` · ${sentCount}✓${failedCount ? ` / ${failedCount}✕` : ""}` : ""}
    </span>
  );
}

/* ------------------------------------------------- rich block editor */

/** RichEditor is imperative (setContent/getContent via ref) and mounts
    async (immediatelyRender:false) — load the block's doc once the
    editor exists, then push every edit up. Keyed by block id + history
    epoch so undo/redo/restore remounts it with the reverted content. */
function RichBlockEditor({ value, onChange }: { value: PMNode; onChange: (doc: PMNode) => void }) {
  const ref = useRef<RichEditorHandle>(null);
  const loaded = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!alive) return;
      const h = ref.current;
      if (h && h.getContent()) {
        h.setContent(value);
        loaded.current = true;
        return;
      }
      requestAnimationFrame(load);
    };
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDirty = useCallback(() => {
    if (!loaded.current) return;
    const json = ref.current?.getContent();
    if (json) onChangeRef.current(json as PMNode);
  }, []);

  return <RichEditor ref={ref} allowImages={false} onDirty={onDirty} onAddImage={() => {}} />;
}

/* --------------------------------------------------- block inspector */

function BlockInspector({
  block,
  pages,
  epoch,
  disabled,
  onPatch,
}: {
  block: DeskBlock;
  pages: PageOption[];
  epoch: number;
  disabled: boolean;
  onPatch: (next: DeskBlock, key: string | null) => void;
}) {
  const cityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of pages) if (!seen.has(p.citySlug)) seen.set(p.citySlug, p.cityName);
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [pages]);

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${INK}`, paddingBottom: 8 }}>
      {LOCKED_CONTENT_TYPES.has(block.type) && <Lock size={13} />}
      <strong style={{ fontSize: 13, letterSpacing: ".05em" }}>{(LETTER_BLOCK_LABELS[block.type] ?? block.type).toUpperCase()}</strong>
      {block.hidden && <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".12em", color: "rgba(29,25,19,.5)" }}>HIDDEN</span>}
    </div>
  );

  const lockedNote = (
    <p className="font-mono" style={{ fontSize: 10, letterSpacing: ".08em", lineHeight: 1.9, color: "rgba(29,25,19,.6)", marginTop: 12 }}>
      {LOCKED_NOTE.toUpperCase()}
    </p>
  );

  let body: React.ReactNode = null;
  switch (block.type) {
    case "masthead":
    case "week-in-numbers":
    case "social":
    case "divider":
      body = lockedNote;
      break;
    case "market-movers":
      body = (
        <>
          {lockedNote}
          <Field label="CITIES SHOWN" hint="LAYOUT ONLY — DATA IS FROZEN NTREIS">
            <select style={inputStyle} disabled={disabled} value={block.count} onChange={(e) => onPatch({ ...block, count: Number(e.target.value) === 3 ? 3 : 5 }, null)}>
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
            </select>
          </Field>
        </>
      );
      break;
    case "editors-note":
    case "richtext":
      body = (
        <div style={{ marginTop: 12, ...(disabled ? { pointerEvents: "none" as const, opacity: 0.6 } : {}) }}>
          <RichBlockEditor key={`${block.id}:${epoch}`} value={block.doc} onChange={(d) => onPatch({ ...block, doc: d }, `rich:${block.id}`)} />
        </div>
      );
      break;
    case "heading":
      body = (
        <>
          <Field label={`TEXT (${block.text.length}/120)`}>
            <input style={inputStyle} disabled={disabled} maxLength={120} value={block.text} onChange={(e) => onPatch({ ...block, text: e.target.value }, `head:${block.id}`)} />
          </Field>
          <Field label="LEVEL">
            <select style={inputStyle} disabled={disabled} value={block.level} onChange={(e) => onPatch({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 }, null)}>
              <option value={2}>H2 — section</option>
              <option value={3}>H3 — sub-section</option>
            </select>
          </Field>
        </>
      );
      break;
    case "image":
      body = (
        <>
          <Field label="IMAGE URL" hint="APPROVED ASSETS ONLY">
            <input style={inputStyle} disabled={disabled} value={block.src} placeholder="https://…/approved-asset.jpg" onChange={(e) => onPatch({ ...block, src: e.target.value }, `img:${block.id}`)} />
          </Field>
          <p className="font-mono" style={{ fontSize: 9, letterSpacing: ".06em", lineHeight: 1.8, color: "rgba(29,25,19,.55)", marginTop: 4 }}>
            IMAGES MUST BE APPROVED EDITORIAL ASSETS — THE SERVER VALIDATES THIS URL ON SAVE AND REJECTS REMOTE HOTLINKS.
          </p>
          <Field label="ALT TEXT" hint="REQUIRED">
            <input style={inputStyle} disabled={disabled} maxLength={300} value={block.alt} onChange={(e) => onPatch({ ...block, alt: e.target.value }, `alt:${block.id}`)} />
          </Field>
          <Field label="ATTRIBUTION" hint="REQUIRED">
            <input style={inputStyle} disabled={disabled} maxLength={160} value={block.attribution} onChange={(e) => onPatch({ ...block, attribution: e.target.value }, `attr:${block.id}`)} />
          </Field>
          <Field label="CAPTION" hint="OPTIONAL">
            <input style={inputStyle} disabled={disabled} maxLength={200} value={block.caption} onChange={(e) => onPatch({ ...block, caption: e.target.value }, `cap:${block.id}`)} />
          </Field>
          <Field label="LINK" hint="OPTIONAL · INTERNAL PATHS ONLY">
            <input style={inputStyle} disabled={disabled} value={block.href} placeholder="/city/plano" onChange={(e) => onPatch({ ...block, href: e.target.value }, `href:${block.id}`)} />
          </Field>
        </>
      );
      break;
    case "stat-strip":
      body = (
        <>
          <Field label={`ITEMS (${block.items.length}/4)`}>
            {block.items.map((it, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  style={{ ...inputStyle, width: 90 }} disabled={disabled} maxLength={20} placeholder="Value" value={it.value}
                  onChange={(e) => onPatch({ ...block, items: block.items.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)) }, `sv:${block.id}:${idx}`)}
                />
                <input
                  style={{ ...inputStyle, flex: 1 }} disabled={disabled} maxLength={60} placeholder="Label" value={it.label}
                  onChange={(e) => onPatch({ ...block, items: block.items.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)) }, `sl:${block.id}:${idx}`)}
                />
                <button
                  type="button" title="Remove row" disabled={disabled || block.items.length <= 1} style={smallBtn()}
                  onClick={() => onPatch({ ...block, items: block.items.filter((_, i) => i !== idx) }, null)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {block.items.length < 4 && (
              <button type="button" disabled={disabled} style={smallBtn()} onClick={() => onPatch({ ...block, items: [...block.items, { value: "", label: "" }] }, null)}>
                <Plus size={12} /> ADD ROW
              </button>
            )}
          </Field>
          <Field label="NOTE" hint="OPTIONAL FOOTNOTE UNDER THE STRIP">
            <input style={inputStyle} disabled={disabled} maxLength={160} value={block.note} onChange={(e) => onPatch({ ...block, note: e.target.value }, `sn:${block.id}`)} />
          </Field>
        </>
      );
      break;
    case "community-spotlight": {
      const hoods = pages.filter((p) => p.citySlug === block.citySlug);
      body = (
        <>
          <Field label="CITY">
            <select style={inputStyle} disabled={disabled} value={block.citySlug} onChange={(e) => onPatch({ ...block, citySlug: e.target.value, hoodSlug: "", name: "" }, null)}>
              <option value="">— pick —</option>
              {cityOptions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="COMMUNITY PAGE">
            <select
              style={inputStyle} disabled={disabled || !block.citySlug} value={block.hoodSlug}
              onChange={(e) => {
                const p = hoods.find((h) => h.hoodSlug === e.target.value);
                onPatch({ ...block, hoodSlug: e.target.value, name: p?.hoodName ?? "" }, null);
              }}
            >
              <option value="">— pick —</option>
              {hoods.map((p) => <option key={p.hoodSlug} value={p.hoodSlug}>{p.hoodName}{p.isNewBuild ? " · NB" : ""}</option>)}
            </select>
          </Field>
          <Field label={`BLURB (${block.blurb.length}/400)`}>
            <textarea style={areaStyle} disabled={disabled} maxLength={400} value={block.blurb} onChange={(e) => onPatch({ ...block, blurb: e.target.value }, `cb:${block.id}`)} />
          </Field>
        </>
      );
      break;
    }
    case "listing-spotlight":
      body = (
        <>
          <Field label="LISTING KEY">
            <input style={inputStyle} disabled={disabled} value={block.listingKey} placeholder="NTREIS ListingKey" onChange={(e) => onPatch({ ...block, listingKey: e.target.value }, `lk:${block.id}`)} />
          </Field>
          <Field label={`HEADLINE (${block.headline.length}/120)`}>
            <input style={inputStyle} disabled={disabled} maxLength={120} value={block.headline} onChange={(e) => onPatch({ ...block, headline: e.target.value }, `lh:${block.id}`)} />
          </Field>
          <Field label={`NOTE (${block.note.length}/300)`} hint="OPTIONAL">
            <textarea style={areaStyle} disabled={disabled} maxLength={300} value={block.note} onChange={(e) => onPatch({ ...block, note: e.target.value }, `ln:${block.id}`)} />
          </Field>
        </>
      );
      break;
    case "cta":
      body = (
        <>
          <Field label={`LABEL (${block.label.length}/40)`}>
            <input style={inputStyle} disabled={disabled} maxLength={40} value={block.label} onChange={(e) => onPatch({ ...block, label: e.target.value }, `cl:${block.id}`)} />
          </Field>
          <Field label="DESTINATION" hint="INTERNAL PATHS ONLY (E.G. /HOMES)">
            <input style={inputStyle} disabled={disabled} value={block.href} placeholder="/homes" onChange={(e) => onPatch({ ...block, href: e.target.value }, `ch:${block.id}`)} />
          </Field>
        </>
      );
      break;
    case "spacer":
      body = (
        <Field label="SIZE">
          <select style={inputStyle} disabled={disabled} value={block.size} onChange={(e) => onPatch({ ...block, size: e.target.value === "sm" || e.target.value === "lg" ? e.target.value : "md" }, null)}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </Field>
      );
      break;
  }

  return (
    <div>
      {head}
      {body}
    </div>
  );
}

/* --------------------------------------------------------- the desk */

export default function LetterDesk({
  adminEmail,
  issues: initialIssues,
  counts,
  pages,
}: {
  adminEmail: string;
  issues: LetterIssue[];
  counts: Counts;
  pages: PageOption[];
}) {
  const [issues, setIssues] = useState<DeskIssue[]>(initialIssues);
  const [openId, setOpenId] = useState<string | null>(null);

  /* working copy (block issues only) + session undo/redo */
  const [doc, setDoc] = useState<LetterDoc | null>(null);
  const [subject, setSubject] = useState("");
  const [selBlockId, setSelBlockId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0); // bumps on undo/redo/restore/open → remounts rich editors
  const undoRef = useRef<Snap[]>([]);
  const redoRef = useRef<Snap[]>([]);
  const lastKeyRef = useRef<string | null>(null); // coalesces per-keystroke edits into one undo step

  const [lint, setLint] = useState<IssueLint | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  /* preview canvas (renders the SAVED row) */
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [pvMode, setPvMode] = useState<"desktop" | "mobile">("desktop");
  const [pvZoom, setPvZoom] = useState<"fit" | "100" | "75">("fit");
  const [pvText, setPvText] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [availW, setAvailW] = useState(660);

  /* version history panel */
  const [histOpen, setHistOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);

  const issue = useMemo(() => issues.find((i) => i.id === openId) ?? null, [issues, openId]);
  const locked = issue?.status === "sent" || issue?.status === "canceled";

  const patchIssue = (id: string, patch: Partial<DeskIssue>) =>
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function post(payload: Record<string, unknown>, busyKey: string): Promise<ApiResp> {
    setBusy(busyKey);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return (await res.json()) as ApiResp;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      setBusy(null);
    }
  }

  /* ---- history-tracked edits (session-only; the server never sees a
     keystroke — SAVE DRAFT is the only write) ---- */
  function applyEdit(nextDoc: LetterDoc, nextSubject: string, key: string | null) {
    if (doc && (key === null || key !== lastKeyRef.current)) {
      undoRef.current.push({ doc, subject });
      redoRef.current = [];
    }
    lastKeyRef.current = key;
    setDoc(nextDoc);
    setSubject(nextSubject);
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev || !doc) return;
    redoRef.current.push({ doc, subject });
    lastKeyRef.current = null;
    setDoc(prev.doc);
    setSubject(prev.subject);
    setEpoch((e) => e + 1);
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next || !doc) return;
    undoRef.current.push({ doc, subject });
    lastKeyRef.current = null;
    setDoc(next.doc);
    setSubject(next.subject);
    setEpoch((e) => e + 1);
  }

  function loadDoc(d: LetterDoc, subj: string) {
    const c = clone(d);
    if (typeof c.preheader !== "string") c.preheader = "";
    undoRef.current = [];
    redoRef.current = [];
    lastKeyRef.current = null;
    setDoc(c);
    setSubject(subj);
    setSelBlockId(c.blocks[0]?.id ?? null);
    setEpoch((e) => e + 1);
  }

  function openIssue(i: DeskIssue) {
    setOpenId(i.id);
    setConfirmText("");
    setLint(null);
    setBanner(null);
    setHistOpen(false);
    setVersions(null);
    setAddOpen(false);
    setPvText(false);
    setPreview(null);
    if (isLetterDoc(i.sections)) loadDoc(i.sections, i.subject ?? "");
    else {
      setDoc(null);
      setSubject(i.subject ?? "");
      setSelBlockId(null);
    }
    if (i.sections) void refreshPreview(i.id);
  }

  /* ---- block operations ---- */
  const editBlocks = (next: DeskBlock[], key: string | null) => {
    if (doc) applyEdit({ ...doc, blocks: next }, subject, key);
  };

  function moveBlock(id: string, dir: -1 | 1) {
    if (!doc) return;
    const idx = doc.blocks.findIndex((b) => b.id === id);
    const j = idx + dir;
    if (idx <= 0 || j <= 0 || j >= doc.blocks.length) return; // masthead pinned first
    const next = [...doc.blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    editBlocks(next, null);
  }

  function toggleHidden(id: string) {
    if (!doc) return;
    editBlocks(doc.blocks.map((b) => (b.id === id && b.type !== "masthead" ? { ...b, hidden: !b.hidden } : b)), null);
  }

  function duplicateBlock(id: string) {
    if (!doc) return;
    const idx = doc.blocks.findIndex((b) => b.id === id);
    const src = doc.blocks[idx];
    if (!src || SINGLETONS.has(src.type)) return;
    const copy: DeskBlock = { ...clone(src), id: newId() };
    const next = [...doc.blocks];
    next.splice(idx + 1, 0, copy);
    editBlocks(next, null);
    setSelBlockId(copy.id);
  }

  function deleteBlock(id: string) {
    if (!doc) return;
    const b = doc.blocks.find((x) => x.id === id);
    if (!b || b.type === "masthead") return;
    if (!window.confirm(`Delete this ${LETTER_BLOCK_LABELS[b.type] ?? b.type} block?`)) return;
    const next = doc.blocks.filter((x) => x.id !== id);
    editBlocks(next, null);
    if (selBlockId === id) setSelBlockId(next[0]?.id ?? null);
  }

  function addBlock(type: BlockType) {
    if (!doc) return;
    if (SINGLETONS.has(type) && doc.blocks.some((b) => b.type === type)) return;
    const nb = freshBlock(type);
    const idx = selBlockId ? doc.blocks.findIndex((b) => b.id === selBlockId) : -1;
    const next = [...doc.blocks];
    next.splice(idx >= 0 ? idx + 1 : next.length, 0, nb);
    editBlocks(next, null);
    setSelBlockId(nb.id);
    setAddOpen(false);
  }

  const patchSelected = (next: DeskBlock, key: string | null) => {
    if (!doc) return;
    applyEdit({ ...doc, blocks: doc.blocks.map((b) => (b.id === next.id ? next : b)) }, subject, key);
  };

  /* ---- server actions (each an explicit click — nothing is automatic) */
  async function refreshPreview(id: string) {
    const r = await post({ action: "preview", issueId: id }, "preview");
    if (r.ok) setPreview({ subject: r.subject ?? "", html: r.html ?? "", text: r.text ?? "" });
    else setBanner(`PREVIEW FAILED — ${r.error}`);
  }

  async function generate() {
    const r = await post({ action: "generate" }, "generate");
    if (!r.ok) return setBanner(`GENERATE FAILED — ${r.error}`);
    setBanner(`NUMBERS ${r.regenerated ? "REGENERATED" : "GENERATED"} FOR ${r.issueDate} — nothing sent, nothing scheduled.`);
    const existing = issues.find((i) => i.id === r.issueId);
    if (existing) patchIssue(r.issueId!, { stats: r.stats ?? existing.stats, status: "draft" });
    else
      setIssues((prev) => [
        { id: r.issueId!, issueDate: r.issueDate!, subject: null, sections: defaultLetterDoc(), stats: r.stats ?? null, status: "draft", sentAt: null, sentCount: 0, failedCount: 0, createdBy: adminEmail, updatedAt: new Date().toISOString() },
        ...prev,
      ]);
  }

  async function save() {
    if (!issue || !doc) return;
    const r = await post({ action: "save", issueId: issue.id, subject, sections: doc }, "save");
    if (!r.ok) {
      if (r.errors?.length) setLint({ errors: r.errors, warnings: [] });
      return setBanner(`SAVE FAILED — ${r.error ?? r.errors?.[0] ?? "rejected by the sanitizer"}`);
    }
    setLint(r.lint ?? null);
    lastKeyRef.current = null;
    patchIssue(issue.id, { subject, sections: clone(doc), status: "draft" });
    setBanner(`SAVED — DRAFT${r.versionNo ? ` · v${r.versionNo}` : ""} (edits drop readiness).${r.versionError ? ` VERSION SNAPSHOT FAILED: ${r.versionError}` : ""}`);
    void refreshPreview(issue.id); // the canvas shows the SAVED row
  }

  async function upgrade() {
    if (!issue) return;
    const r = await post({ action: "convert", issueId: issue.id }, "convert");
    if (!r.ok || !r.doc) return setBanner(`UPGRADE FAILED — ${r.error ?? r.errors?.[0] ?? "conversion rejected"}`);
    loadDoc(r.doc, issue.subject ?? "");
    patchIssue(issue.id, { sections: clone(r.doc), status: "draft" });
    setBanner("UPGRADED TO THE VISUAL EDITOR — blocks, versions, and the live preview are on.");
    void refreshPreview(issue.id);
  }

  async function ready() {
    if (!issue) return;
    const r = await post({ action: "ready", issueId: issue.id }, "ready");
    if (r.lint) setLint(r.lint);
    if (!r.ok) return setBanner(`READY REFUSED — ${r.error}`);
    patchIssue(issue.id, { status: "ready" });
    setBanner("READY ✓ — still nothing sends without the typed confirmation.");
  }

  async function testSend() {
    if (!issue) return;
    const r = await post({ action: "test-send", issueId: issue.id }, "test");
    if (!r.ok) return setBanner(`TEST SEND FAILED — ${r.error}`);
    setBanner(`TEST COPY SENT TO ${r.to}${r.dryRun ? " (dev dry-run)" : ""} — subscribers untouched.`);
  }

  async function sendIssue() {
    if (!issue) return;
    const r = await post({ action: "send", issueId: issue.id, confirm: confirmText }, "send");
    if (!r.ok) return setBanner(`SEND REFUSED — ${r.error}`);
    patchIssue(issue.id, { status: "sent", sentCount: r.sent ?? 0, failedCount: r.failed ?? 0, sentAt: new Date().toISOString() });
    setBanner(`SENT — ${r.sent} delivered, ${r.failed} failed, ${r.skippedAlreadySent} already had it.`);
    setConfirmText("");
  }

  async function openHistory() {
    if (!issue) return;
    setHistOpen(true);
    setVersions(null);
    const r = await post({ action: "versions", issueId: issue.id }, "versions");
    if (r.ok) setVersions(r.versions ?? []);
    else setBanner(`HISTORY FAILED — ${r.error}`);
  }

  async function restoreVersion(versionNo: number) {
    if (!issue) return;
    if (!window.confirm(`Restore version ${versionNo}? Restoring writes a NEW draft version — nothing is overwritten.`)) return;
    const r = await post({ action: "restore", issueId: issue.id, versionNo }, "restore");
    if (!r.ok) return setBanner(`RESTORE FAILED — ${r.error}`);
    // reload the restored row: convert on an already-block issue is a pure read (returns the doc, writes nothing)
    const c = await post({ action: "convert", issueId: issue.id }, "reload");
    if (c.ok && c.doc) {
      loadDoc(c.doc, r.subject ?? "");
      patchIssue(issue.id, { subject: r.subject ?? null, sections: clone(c.doc), status: "draft" });
    }
    setHistOpen(false);
    setBanner(`RESTORED v${r.restoredFrom} AS NEW DRAFT${r.newVersionNo ? ` v${r.newVersionNo}` : ""}.`);
    void refreshPreview(issue.id);
  }

  /* ---- preview canvas geometry ---- */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth));
    ro.observe(el);
    setAvailW(el.clientWidth);
    return () => ro.disconnect();
  }, [openId, doc === null]);

  const frameW = pvMode === "desktop" ? 640 : 375;
  const scale = pvZoom === "fit" ? Math.min(1, Math.max(0.2, (availW - 20) / frameW)) : pvZoom === "100" ? 1 : 0.75;

  const selBlock = doc?.blocks.find((b) => b.id === selBlockId) ?? null;

  const canvas = (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <button type="button" style={smallBtn(pvMode === "desktop")} onClick={() => setPvMode("desktop")} title="Desktop width (640px)"><Monitor size={12} /> DESKTOP</button>
        <button type="button" style={smallBtn(pvMode === "mobile")} onClick={() => setPvMode("mobile")} title="Mobile width (375px)"><Smartphone size={12} /> MOBILE</button>
        <span style={{ width: 8 }} />
        <button type="button" style={smallBtn(pvZoom === "fit")} onClick={() => setPvZoom("fit")}>FIT</button>
        <button type="button" style={smallBtn(pvZoom === "100")} onClick={() => setPvZoom("100")}>100%</button>
        <button type="button" style={smallBtn(pvZoom === "75")} onClick={() => setPvZoom("75")}>75%</button>
        <span style={{ width: 8 }} />
        <button type="button" style={smallBtn(pvText)} onClick={() => setPvText((v) => !v)} title="Plain-text alternative"><FileText size={12} /> {pvText ? "HTML VIEW" : "PLAIN TEXT"}</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={smallBtn()} disabled={busy !== null || !issue} onClick={() => issue && void refreshPreview(issue.id)}>
          <RefreshCw size={12} /> {busy === "preview" ? "RENDERING…" : "REFRESH PREVIEW"}
        </button>
      </div>
      <p className="font-mono" style={{ margin: "0 0 6px", fontSize: 9, letterSpacing: ".1em", color: "rgba(29,25,19,.5)" }}>
        THE PREVIEW RENDERS THE LAST SAVED ROW — SAVE DRAFT TO SEE UNSAVED EDITS.
      </p>
      <div ref={canvasRef} style={{ background: "#EDE6D6", border: `2px solid ${INK}`, borderRadius: 12, padding: 10, overflow: "hidden" }}>
        {!preview ? (
          <p className="font-mono" style={{ margin: 0, padding: 24, fontSize: 11, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", textAlign: "center" }}>
            {busy === "preview" ? "RENDERING THE SAVED ISSUE…" : "NO PREVIEW YET — HIT REFRESH PREVIEW."}
          </p>
        ) : pvText ? (
          <pre className="font-mono" style={{ margin: 0, padding: 14, fontSize: 11.5, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: CANVAS_H, overflow: "auto", background: "#fff", border: `1.5px solid ${INK}`, borderRadius: 8, color: INK }}>
            {preview.text || "—"}
          </pre>
        ) : (
          <div style={{ width: frameW * scale, height: CANVAS_H, margin: "0 auto", overflow: "hidden" }}>
            <iframe
              title="Letter preview"
              sandbox=""
              srcDoc={preview.html}
              style={{ width: frameW, height: CANVAS_H / scale, border: 0, background: CREAM, display: "block", transform: `scale(${scale})`, transformOrigin: "top left" }}
            />
          </div>
        )}
      </div>
      <p className="font-mono" style={{ margin: "8px 0 0", fontSize: 9.5, letterSpacing: ".08em", lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
        THE COMPLIANCE FOOTER (IDENTITY, POSTAL ADDRESS, UNSUBSCRIBE) IS APPENDED AUTOMATICALLY TO EVERY RENDER AND CANNOT BE EDITED OR REMOVED.
      </p>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px" }}>
      <div style={{ maxWidth: 1460, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>THE LETTER — ISSUE BUILDER</h1>
            <p className="font-mono" style={{ margin: "4px 0 0", fontSize: 10, letterSpacing: ".1em", color: "rgba(29,25,19,.65)" }}>
              NO AUTO-SEND · TEST COPIES GO ONLY TO YOU · REAL SENDS NEED THE TYPED PHRASE · SIGNED IN AS {adminEmail.toUpperCase()}
            </p>
          </div>
          <button style={btn(true)} onClick={generate} disabled={busy !== null}>
            <Mail size={13} /> {busy === "generate" ? "READING THE WEEK…" : "GENERATE NEXT SUNDAY"}
          </button>
        </header>

        {banner && (
          <div style={{ border: `2px solid ${banner.includes("FAILED") || banner.includes("REFUSED") ? ORANGE : INK}`, background: CARD, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {banner}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "250px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
          {/* ---- issue rail ---- */}
          <aside>
            <div style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: "rgba(29,25,19,.6)", marginBottom: 6 }}>SUBSCRIBERS</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span><strong style={{ fontSize: 18 }}>{counts.subscribed}</strong> <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".12em" }}>SUBSCRIBED</span></span>
                <span><strong style={{ fontSize: 18 }}>{counts.pending}</strong> <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".12em" }}>PENDING</span></span>
                <span><strong style={{ fontSize: 18 }}>{counts.unsubscribed}</strong> <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".12em" }}>UNSUB</span></span>
              </div>
            </div>

            <h2 style={{ fontSize: 13, letterSpacing: ".1em", borderBottom: `2px solid ${INK}`, paddingBottom: 6, margin: "0 0 4px" }}>ISSUES ({issues.length})</h2>
            {issues.length === 0 && (
              <p style={{ fontSize: 12.5 }}>No issues yet — GENERATE NEXT SUNDAY starts the first one. (Empty is expected until migration 0015 is applied.)</p>
            )}
            {issues.map((i) => (
              <article
                key={i.id}
                onClick={() => openIssue(i)}
                style={{
                  border: `2px solid ${i.id === openId ? ORANGE : INK}`,
                  background: i.id === openId ? "#fff" : CARD,
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginTop: 8,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{i.issueDate}</strong>
                  <StatusChip status={i.status} sentCount={i.sentCount} failedCount={i.failedCount} />
                </div>
                <div style={{ fontSize: 11.5, marginTop: 3, color: "rgba(29,25,19,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.subject ?? "(no subject yet)"}
                </div>
                <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".08em", marginTop: 3, color: "rgba(29,25,19,.5)" }}>
                  {i.stats ? `${i.stats.metro.actives.toLocaleString()} ACTIVES · ${i.stats.metro.new7d} NEW 7D` : "NO NUMBERS YET"}
                  {isLetterDoc(i.sections) ? " · BLOCKS" : " · FLAT"}
                </div>
              </article>
            ))}
          </aside>

          {/* ---- workspace ---- */}
          <section>
            {!issue && (
              <div style={{ border: `2px dashed ${INK}`, borderRadius: 12, padding: 32, textAlign: "center", color: "rgba(29,25,19,.6)", fontSize: 13 }}>
                Pick an issue on the left — or GENERATE NEXT SUNDAY to start one.
              </div>
            )}

            {issue && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 15, letterSpacing: ".08em" }}>ISSUE {issue.issueDate}</h2>
                  <StatusChip status={issue.status} sentCount={issue.sentCount} failedCount={issue.failedCount} />
                  {issue.stats && (
                    <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".08em", color: "rgba(29,25,19,.55)" }}>
                      NUMBERS AS OF {issue.stats.generatedAt}: {issue.stats.metro.actives.toLocaleString()} METRO ACTIVES · {issue.stats.metro.new7d.toLocaleString()} NEW (7D)
                    </span>
                  )}
                </div>

                {/* ---- legacy flat issue: upgrade or read-only notice ---- */}
                {!doc && (
                  <div style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 12, padding: 18, marginBottom: 16 }}>
                    {issue.status === "draft" || issue.status === "ready" ? (
                      <>
                        <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.7 }}>
                          This issue still uses the flat format. Upgrade it to the visual editor to get blocks, drag-free reordering, version history, and the live email canvas. The upgrade keeps the editor&apos;s note and community pick.
                        </p>
                        <button style={btn(true)} disabled={busy !== null} onClick={upgrade}>
                          {busy === "convert" ? "UPGRADING…" : "UPGRADE TO THE VISUAL EDITOR"}
                        </button>
                      </>
                    ) : (
                      <p className="font-mono" style={{ margin: 0, fontSize: 11, letterSpacing: ".08em", lineHeight: 1.9, color: "rgba(29,25,19,.65)" }}>
                        THIS ISSUE IS {issue.status.toUpperCase()} IN THE ORIGINAL FLAT FORMAT — SENT HISTORY KEEPS ITS ORIGINAL FORMAT AND RENDERS EXACTLY AS IT WENT OUT.
                      </p>
                    )}
                  </div>
                )}

                {/* ---- toolbar (block issues) ---- */}
                {doc && !locked && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                    <button style={btn(true)} disabled={busy !== null} onClick={save}>
                      {busy === "save" ? "SAVING…" : "SAVE DRAFT"}
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={() => void refreshPreview(issue.id)}>
                      <RefreshCw size={12} /> {busy === "preview" ? "RENDERING…" : "PREVIEW"}
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={openHistory}>
                      <History size={12} /> HISTORY
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={testSend} title="Sends one test copy to your own inbox — never to subscribers">
                      <Send size={12} /> {busy === "test" ? "SENDING…" : `TEST SEND — TO ${adminEmail.toUpperCase()} ONLY`}
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={ready}>
                      {busy === "ready" ? "LINTING…" : "MARK READY"}
                    </button>
                    <span style={{ flex: 1 }} />
                    <button style={smallBtn()} title="Undo" disabled={undoRef.current.length === 0} onClick={undo}>
                      <Undo2 size={12} /> UNDO
                    </button>
                    <button style={smallBtn()} title="Redo" disabled={redoRef.current.length === 0} onClick={redo}>
                      <Redo2 size={12} /> REDO
                    </button>
                  </div>
                )}

                {/* ---- lint results ---- */}
                {lint && (
                  <div style={{ marginBottom: 12, border: `1.5px dashed ${lint.errors.length ? ORANGE : INK}`, borderRadius: 10, padding: 12, fontSize: 13, background: CARD }}>
                    <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", marginBottom: 6 }}>
                      LINT — {lint.errors.length} ERROR(S), {lint.warnings.length} WARNING(S)
                    </div>
                    {lint.errors.map((e, i) => <p key={`e${i}`} style={{ margin: "2px 0", color: ORANGE }}>✕ {e}</p>)}
                    {lint.warnings.map((w, i) => <p key={`w${i}`} style={{ margin: "2px 0" }}>△ {w}</p>)}
                    {!lint.errors.length && <p style={{ margin: "2px 0" }}>✓ clean — ready to mark ready</p>}
                  </div>
                )}

                {/* ---- version history panel ---- */}
                {histOpen && (
                  <div style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${INK}`, paddingBottom: 6, marginBottom: 8 }}>
                      <strong style={{ fontSize: 13, letterSpacing: ".08em" }}>VERSION HISTORY</strong>
                      <button type="button" style={smallBtn()} onClick={() => setHistOpen(false)}><X size={12} /> CLOSE</button>
                    </div>
                    {versions === null && <p className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", color: "rgba(29,25,19,.55)" }}>LOADING…</p>}
                    {versions?.length === 0 && <p style={{ fontSize: 12.5, margin: 0 }}>No versions yet — SAVE DRAFT writes the first snapshot.</p>}
                    {versions?.map((v) => (
                      <div key={v.versionNo} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(29,25,19,.15)", flexWrap: "wrap" }}>
                        <strong className="font-mono" style={{ fontSize: 11 }}>v{v.versionNo}</strong>
                        <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", color: "rgba(29,25,19,.55)" }}>{v.status.toUpperCase()}</span>
                        <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.subject ?? "(no subject)"}</span>
                        <span className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.5)" }}>{v.admin} · {new Date(v.at).toLocaleString()}</span>
                        {!locked && (
                          <button type="button" style={smallBtn()} disabled={busy !== null} onClick={() => void restoreVersion(v.versionNo)}>
                            {busy === "restore" ? "RESTORING…" : "RESTORE"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ---- three-zone editor (block issues) ---- */}
                {doc ? (
                  <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr) 320px", gap: 14, alignItems: "start" }}>
                    {/* LEFT — navigator */}
                    <div style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 12, padding: "12px 12px 14px" }}>
                      <Field label={`SUBJECT (${subject.length}/120)`}>
                        <input style={inputStyle} disabled={locked} maxLength={120} value={subject} placeholder='e.g. "The week North Texas blinked"' onChange={(e) => applyEdit(doc, e.target.value, "subject")} />
                      </Field>
                      <Field label={`PREHEADER (${doc.preheader.length}/140)`} hint="INBOX PREVIEW LINE">
                        <input style={inputStyle} disabled={locked} maxLength={140} value={doc.preheader} onChange={(e) => applyEdit({ ...doc, preheader: e.target.value }, subject, "preheader")} />
                      </Field>

                      <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "rgba(29,25,19,.6)", margin: "16px 0 4px" }}>BLOCKS</div>
                      {doc.blocks.map((b, idx) => {
                        const sel = b.id === selBlockId;
                        const isMast = b.type === "masthead";
                        const iconStyle: React.CSSProperties = { border: "none", background: "transparent", color: "inherit", padding: 2, display: "inline-flex", cursor: "pointer" };
                        const dim = (off: boolean): React.CSSProperties => ({ ...iconStyle, opacity: off ? 0.2 : 0.85, cursor: off ? "default" : "pointer" });
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelBlockId(b.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 5, padding: "6px 8px", marginTop: 5, borderRadius: 8,
                              border: `1.5px solid ${INK}`, cursor: "pointer",
                              background: sel ? INK : "#fff", color: sel ? CREAM : INK, opacity: b.hidden ? 0.55 : 1,
                            }}
                          >
                            {LOCKED_CONTENT_TYPES.has(b.type) && <Lock size={11} />}
                            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, textDecoration: b.hidden ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {LETTER_BLOCK_LABELS[b.type] ?? b.type}
                            </span>
                            {!locked && (
                              <>
                                <button type="button" title="Move up" style={dim(isMast || idx <= 1)} disabled={isMast || idx <= 1} onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }}>
                                  <ArrowUp size={12} />
                                </button>
                                <button type="button" title="Move down" style={dim(isMast || idx === doc.blocks.length - 1)} disabled={isMast || idx === doc.blocks.length - 1} onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }}>
                                  <ArrowDown size={12} />
                                </button>
                                {!isMast && (
                                  <button type="button" title={b.hidden ? "Show" : "Hide"} style={dim(false)} onClick={(e) => { e.stopPropagation(); toggleHidden(b.id); }}>
                                    {b.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                                  </button>
                                )}
                                <button type="button" title="Duplicate" style={dim(SINGLETONS.has(b.type))} disabled={SINGLETONS.has(b.type)} onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }}>
                                  <Copy size={12} />
                                </button>
                                {!isMast && (
                                  <button type="button" title="Delete" style={dim(false)} onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}>
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}

                      {!locked && (
                        <>
                          <button type="button" style={{ ...btn(), marginTop: 10, width: "100%", justifyContent: "center" }} onClick={() => setAddOpen((v) => !v)}>
                            <Plus size={13} /> ADD BLOCK
                          </button>
                          {addOpen && (
                            <div style={{ border: `1.5px solid ${INK}`, borderRadius: 10, background: "#fff", padding: 6, marginTop: 6 }}>
                              {LETTER_BLOCK_TYPES.map((t) => {
                                const taken = SINGLETONS.has(t) && doc.blocks.some((b) => b.type === t);
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    disabled={taken}
                                    onClick={() => addBlock(t)}
                                    style={{
                                      display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                                      padding: "5px 7px", fontSize: 11.5, fontWeight: 600, color: taken ? "rgba(29,25,19,.35)" : INK,
                                      cursor: taken ? "default" : "pointer", borderRadius: 6,
                                    }}
                                  >
                                    {LETTER_BLOCK_LABELS[t]}
                                    {taken && <span className="font-mono" style={{ fontSize: 8.5, letterSpacing: ".1em", marginLeft: 6 }}>ONLY ONE</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* CENTER — email canvas */}
                    {canvas}

                    {/* RIGHT — inspector */}
                    <div style={{ border: `2px solid ${INK}`, background: CARD, borderRadius: 12, padding: "12px 14px 16px" }}>
                      {selBlock ? (
                        <BlockInspector block={selBlock} pages={pages} epoch={epoch} disabled={locked === true} onPatch={patchSelected} />
                      ) : (
                        <p className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", margin: 0 }}>SELECT A BLOCK TO EDIT IT.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* legacy issues still get the rendered preview */
                  issue.sections != null && canvas
                )}

                {/* ---- the real send — ready issues only, typed phrase required ---- */}
                {issue.status === "ready" && (
                  <div style={{ border: `2px solid ${ORANGE}`, background: CARD, borderRadius: 12, padding: 14, marginTop: 14 }}>
                    <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: ORANGE }}>
                      REAL SEND — TYPE: SEND {issue.issueDate}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                      <input style={{ ...inputStyle, maxWidth: 260 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`SEND ${issue.issueDate}`} />
                      <button
                        style={{ ...btn(true), borderColor: ORANGE_DARK, opacity: confirmText === `SEND ${issue.issueDate}` ? 1 : 0.5 }}
                        onClick={sendIssue}
                        disabled={busy !== null || confirmText !== `SEND ${issue.issueDate}`}
                      >
                        {busy === "send" ? "SENDING…" : `SEND FOR REAL — TO ${counts.subscribed} SUBSCRIBER${counts.subscribed === 1 ? "" : "S"}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="font-mono" style={{ marginTop: 28, fontSize: 10, letterSpacing: ".06em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
          TL-3 · GENERATED FROM OUR OWN DATA (LIVE NTREIS CLASS) · PER-RECIPIENT UNSUBSCRIBE TOKENS + ONE-CLICK HEADERS ·
          letter_sends UNIQUE(ISSUE, SUBSCRIBER) MAKES DOUBLE-DELIVERY IMPOSSIBLE · NO CRON, NO BROADCAST API, NO CLAUDE WRITING
        </footer>
      </div>
    </main>
  );
}
