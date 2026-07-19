"use client";
/* Community Page Studio — Phase 3 of the Visual Builder.

   ONE workspace over the systems that already exist, duplicating none of
   them: the CB-1 community-draft portal (/api/admin/communities), the
   CB-3a content desk + server lint (/api/admin/communities/content), the
   Photo Desk (CI-6/7) via the generalized pick-photos endpoint, the MLS
   read-only lookup, the Visual Builder's real-page canvas (embedded, with
   PAGE-SPECIFIC layout documents), and the private HoodPageView draft
   preview. Publishing NEVER happens here for new pages — the CB-2
   exporter → reviewed PR → deploy → mark-live lifecycle is surfaced
   honestly, step by step. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  TriangleAlert,
  Camera,
  Eye,
  Archive,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react";
import { cities, bySlug } from "@/lib/dfw-data";
import { slugifyHood } from "@/lib/hoods";
import VisualBuilder, { PickPhotoModal, type PickPhotoInfo } from "./VisualBuilder";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";
const GREEN = "#2c6e49";

/* mirrors the inventory endpoint */
interface StudioItem {
  key: string;
  citySlug: string;
  cityName: string;
  slug: string;
  name: string;
  type: "hood" | "new_build";
  kind: "live-page" | "draft";
  lifecycle: "live" | "draft" | "ready" | "exported" | "archived";
  hasCustomContent: boolean;
  contentLifecycle: string | null;
  contentLintErrors: number;
  heroApproved: boolean;
  heroPending: number;
  mlsMatched: boolean;
  hasPageLayout: boolean;
  draftId: string | null;
  contentDraftId: string | null;
  warnings: string[];
}

interface LintIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}
interface Lint {
  errors: LintIssue[];
  warnings: LintIssue[];
  at: string;
}

interface Facts {
  type: "hood" | "new_build";
  name: string;
  city_slug: string;
  slug: string;
  status_label: string | null;
  from_label: string | null;
  builders_count: number | null;
  builders_label: string | null;
  note: string | null;
  lifecycle: string;
  ready_for_export: boolean;
  mls_snapshot_json: Record<string, unknown> | null;
}

interface ContentFields {
  seoTitle: string;
  seoDescription: string;
  tagline: string;
  intro: string; // textarea: blank-line separated paragraphs
  homesCopy: string;
  highlights: { title: string; note: string }[];
  faq: { q: string; a: string }[];
  amenities: string; // one per line (nb)
  buyerNotes: string; // one per line (nb)
  links: { label: string; href: string }[];
}

const EMPTY_CONTENT: ContentFields = {
  seoTitle: "",
  seoDescription: "",
  tagline: "",
  intro: "",
  homesCopy: "",
  highlights: [],
  faq: [],
  amenities: "",
  buyerNotes: "",
  links: [],
};

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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: "rgba(29,25,19,.6)" }}>{label}</span>
      {hint && <span className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.45)", marginLeft: 8 }}>{hint}</span>}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

/* ============================================================== studio */
export default function CommunityStudio({ adminEmail }: { adminEmail: string }) {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "hood" | "new_build" | "drafts" | "attention">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("canvas");
  const [newOpen, setNewOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [detailLint, setDetailLint] = useState<Lint | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [content, setContent] = useState<ContentFields>(EMPTY_CONTENT);
  const [contentDirty, setContentDirty] = useState(false);
  const [contentLint, setContentLint] = useState<Lint | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [lookup, setLookup] = useState<Record<string, unknown> | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [photoInfo, setPhotoInfo] = useState<PickPhotoInfo | null>(null);
  const [photoModal, setPhotoModal] = useState(false);

  const selected = items.find((i) => i.key === selectedKey) ?? null;

  const loadInventory = useCallback(async (detail?: string) => {
    setLoading(true);
    try {
      const url = detail ? `/api/admin/editor/communities?detail=${encodeURIComponent(detail)}` : "/api/admin/editor/communities";
      const j = await (await fetch(url)).json();
      if (j.ok) {
        setItems(j.items as StudioItem[]);
        if (j.detail) {
          setDetailLint((j.detail.lint as Lint) ?? null);
          const f = j.detail.facts as Facts | null;
          setFacts(f);
          const cd = j.detail.contentDraft as Record<string, unknown> | null;
          setContent(
            cd
              ? {
                  seoTitle: String(cd.seo_title ?? ""),
                  seoDescription: String(cd.seo_description ?? ""),
                  tagline: String(cd.tagline ?? ""),
                  intro: ((cd.intro_json as string[]) ?? []).join("\n\n"),
                  homesCopy: String(cd.homes_copy ?? ""),
                  highlights: (cd.highlights_json as { title: string; note: string }[]) ?? [],
                  faq: (cd.faq_json as { q: string; a: string }[]) ?? [],
                  amenities: ((cd.newbuild_json as { amenities?: string[] })?.amenities ?? []).join("\n"),
                  buyerNotes: ((cd.newbuild_json as { buyerNotes?: string[] })?.buyerNotes ?? []).join("\n"),
                  links: (cd.links_json as { label: string; href: string }[]) ?? [],
                }
              : EMPTY_CONTENT
          );
          setContentDirty(false);
          setContentLint((cd?.lint_json as Lint) ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const select = useCallback(
    (key: string | null, initialTab?: string) => {
      setSelectedKey(key);
      setLookup(null);
      setPhotoInfo(null);
      setDetailLint(null);
      setFacts(null);
      setContent(EMPTY_CONTENT);
      setContentLint(null);
      if (key) {
        const item = items.find((i) => i.key === key);
        setTab(initialTab ?? (item?.kind === "draft" ? "identity" : "canvas"));
        void loadInventory(key);
        void loadPhoto(key);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [items, loadInventory]
  );

  const loadPhoto = useCallback(async (key: string) => {
    try {
      const j = await (await fetch(`/api/admin/editor/pick-photos?entity=neighborhood&key=${encodeURIComponent(key)}`)).json();
      if (j.ok) setPhotoInfo(j as PickPhotoInfo);
    } catch {
      /* panel shows loading text */
    }
  }, []);

  /* ------------------------------------------------- content autosave */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const saveContent = useCallback(
    async (lintOnly = false) => {
      if (!selected) return;
      const f = contentRef.current;
      const fields = {
        seoTitle: f.seoTitle || null,
        seoDescription: f.seoDescription || null,
        tagline: f.tagline || null,
        intro: f.intro.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        homesCopy: f.homesCopy || null,
        highlights: f.highlights.filter((h) => h.title.trim()),
        faq: f.faq.filter((x) => x.q.trim()),
        newBuild:
          selected.type === "new_build"
            ? {
                amenities: f.amenities.split(/\n/).map((s) => s.trim()).filter(Boolean),
                buyerNotes: f.buyerNotes.split(/\n/).map((s) => s.trim()).filter(Boolean),
              }
            : null,
        links: f.links.filter((l) => l.label.trim() && l.href.trim()),
      };
      setSavingContent(true);
      try {
        const j = await post("/api/admin/communities/content", {
          action: lintOnly ? "lint" : "save",
          citySlug: selected.citySlug,
          hoodSlug: selected.slug,
          fields,
        });
        if (j.ok) {
          if (j.lint) setContentLint(j.lint as Lint);
          if (!lintOnly) setContentDirty(false);
        } else {
          setMessage({ kind: "error", text: String(j.error ?? "Content save failed") });
        }
      } finally {
        setSavingContent(false);
      }
    },
    [selected]
  );
  const touchContent = (patch: Partial<ContentFields>) => {
    setContent((c) => ({ ...c, ...patch }));
    setContentDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveContent(false), 1200); // autosaving draft workspace
  };

  /* --------------------------------------------------------- filtering */
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items
      .filter((i) => i.lifecycle !== "archived" || filter === "drafts")
      .filter((i) =>
        filter === "all"
          ? true
          : filter === "hood"
            ? i.type === "hood"
            : filter === "new_build"
              ? i.type === "new_build"
              : filter === "drafts"
                ? i.kind === "draft"
                : i.warnings.length > 0
      )
      .filter((i) => !qq || i.name.toLowerCase().includes(qq) || i.cityName.toLowerCase().includes(qq) || i.slug.includes(qq));
  }, [items, q, filter]);
  const byCity = useMemo(() => {
    const m = new Map<string, StudioItem[]>();
    for (const i of visible) {
      if (!m.has(i.cityName)) m.set(i.cityName, []);
      m.get(i.cityName)!.push(i);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  /* ============================================================ render */
  return (
    <div style={{ height: "calc(100vh - 92px)", display: "grid", gridTemplateColumns: "330px minmax(0,1fr)", overflow: "hidden" }}>
      {/* --------------------------------------------------- inventory */}
      <aside style={{ borderRight: `2px solid ${INK}`, background: CARD, overflowY: "auto", padding: "12px 12px 40px" }}>
        <button type="button" className="font-mono" style={{ ...btn(true), width: "100%", justifyContent: "center" }} onClick={() => setNewOpen(true)}>
          <Plus size={14} /> NEW COMMUNITY
        </button>
        <div style={{ position: "relative", marginTop: 10 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: 10, color: "rgba(29,25,19,.45)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities & cities…" style={{ ...inputStyle, paddingLeft: 28 }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {(
            [
              ["all", "ALL"],
              ["hood", "HOODS"],
              ["new_build", "NEW BUILDS"],
              ["drafts", "DRAFTS"],
              ["attention", "⚠ ATTENTION"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className="font-mono" style={{ border: `1.5px solid ${filter === k ? ORANGE : "rgba(29,25,19,.3)"}`, borderRadius: 999, padding: "4px 9px", fontSize: 9, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", background: filter === k ? "rgba(217,72,31,.1)" : "transparent", color: INK }}>
              {label}
            </button>
          ))}
        </div>
        {loading && <div className="font-mono" style={{ fontSize: 10, marginTop: 12, color: "rgba(29,25,19,.5)" }}>LOADING INVENTORY…</div>}
        {byCity.map(([cityName, list]) => (
          <div key={cityName} style={{ marginTop: 12 }}>
            <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".2em", color: "rgba(29,25,19,.5)" }}>{cityName.toUpperCase()}</div>
            {list.map((i) => (
              <button
                key={i.key + i.kind}
                type="button"
                onClick={() => select(i.key)}
                style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: selectedKey === i.key ? INK : "transparent", color: selectedKey === i.key ? CREAM : INK, borderRadius: 8, padding: "7px 9px", marginTop: 3, cursor: "pointer", fontFamily: "inherit" }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                  {i.warnings.length > 0 && <TriangleAlert size={12} color={selectedKey === i.key ? "#F1A08A" : ORANGE_DARK} aria-label={i.warnings.join("; ")} />}
                </div>
                <div className="font-mono" style={{ display: "flex", gap: 5, fontSize: 8, letterSpacing: ".06em", marginTop: 3, flexWrap: "wrap", opacity: 0.85 }}>
                  <span style={{ border: "1px solid currentColor", borderRadius: 4, padding: "1px 4px" }}>{i.type === "new_build" ? "NEW BUILD" : "NEIGHBORHOOD"}</span>
                  <span style={{ border: "1px solid currentColor", borderRadius: 4, padding: "1px 4px", color: i.lifecycle === "live" ? (selectedKey === i.key ? "#9fd8b5" : GREEN) : undefined }}>{i.lifecycle.toUpperCase()}</span>
                  {i.hasCustomContent && <span title="Custom page content">✎ CONTENT</span>}
                  {i.heroApproved ? <span title="Approved hero photo">📷 HERO</span> : null}
                  {i.mlsMatched && <span title="MLS evidence on file">MLS ✓</span>}
                  {i.hasPageLayout && <span title="Published page-specific layout override">LAYOUT*</span>}
                </div>
              </button>
            ))}
          </div>
        ))}
        {!loading && visible.length === 0 && <div className="font-mono" style={{ fontSize: 10, marginTop: 12, color: "rgba(29,25,19,.5)" }}>NOTHING MATCHES.</div>}
      </aside>

      {/* ------------------------------------------------------ detail */}
      <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "#E9E0CC" }}>
        {!selected ? (
          <div className="font-mono" style={{ margin: "auto", fontSize: 12, lineHeight: 2.2, color: "rgba(29,25,19,.6)", textAlign: "center" }}>
            SELECT A COMMUNITY FROM THE INVENTORY —
            <br />or create one with + NEW COMMUNITY.
            <br />
            <br />Live pages open the REAL page canvas (edits are THIS PAGE ONLY).
            <br />Drafts walk identity → facts → copy → photos → private preview.
          </div>
        ) : (
          <>
            <div className="font-mono" style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: `2px solid ${INK}`, background: CARD, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{selected.name}</span>
              <span style={{ fontSize: 9.5, letterSpacing: ".1em", color: "rgba(29,25,19,.55)" }}>
                {selected.cityName} · /city/{selected.key} · {selected.type === "new_build" ? "NEW BUILD" : "NEIGHBORHOOD"} · {selected.lifecycle.toUpperCase()}
              </span>
              {selected.kind === "live-page" ? (
                <span style={{ fontSize: 9, fontWeight: 700, color: GREEN, letterSpacing: ".08em" }}>EDITS HERE ARE THIS PAGE ONLY</span>
              ) : (
                <span style={{ fontSize: 9, fontWeight: 700, color: ORANGE_DARK, letterSpacing: ".08em" }}>PRIVATE DRAFT — NOT PUBLIC UNTIL EXPORTED, REVIEWED & DEPLOYED</span>
              )}
              <span style={{ flex: 1 }} />
              {message && (
                <span style={{ fontSize: 10, fontWeight: 700, maxWidth: 380, color: message.kind === "error" ? ORANGE_DARK : message.kind === "warn" ? "#8a6d1a" : "rgba(29,25,19,.7)" }}>{message.text}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 2, padding: "6px 14px 0", background: CARD, borderBottom: `2px solid ${INK}` }}>
              {(selected.kind === "live-page"
                ? [
                    ["canvas", "PAGE CANVAS"],
                    ["content", "CONTENT & SEO"],
                    ["photos", "PHOTOS"],
                    ["status", "STATUS & CHECKLIST"],
                  ]
                : [
                    ["identity", "1 · IDENTITY"],
                    ["facts", "2 · FACTS & MLS"],
                    ["content", "3 · CONTENT & SEO"],
                    ["photos", "4 · PHOTOS"],
                    ["preview", "5 · PREVIEW & LIFECYCLE"],
                  ]
              ).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className="font-mono" style={{ border: "none", borderBottom: tab === k ? `3px solid ${ORANGE}` : "3px solid transparent", background: "transparent", padding: "8px 12px", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", cursor: "pointer", color: tab === k ? INK : "rgba(29,25,19,.55)" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: tab === "canvas" ? "hidden" : "auto" }}>
              {/* live page: the REAL canvas, page-specific */}
              {tab === "canvas" && selected.kind === "live-page" && (
                <VisualBuilder
                  key={selected.key}
                  adminEmail={adminEmail}
                  embedded
                  initialTarget={{ route: `/city/${selected.key}`, title: `${selected.name} — THIS PAGE ONLY` }}
                />
              )}

              {tab === "identity" && selected.kind === "draft" && facts && (
                <IdentityPanel facts={facts} onSaved={() => void loadInventory(selected.key)} draftId={selected.draftId!} setMessage={setMessage} />
              )}

              {tab === "facts" && selected.kind === "draft" && facts && (
                <FactsPanel
                  facts={facts}
                  draftId={selected.draftId!}
                  lookup={lookup}
                  lookupBusy={lookupBusy}
                  onLookup={async () => {
                    setLookupBusy(true);
                    try {
                      const j = await post("/api/admin/communities/lookup", { name: facts.name, citySlug: facts.city_slug });
                      if (j.ok) setLookup(j.lookup as Record<string, unknown>);
                      else setMessage({ kind: "error", text: String(j.error ?? "Lookup failed") });
                    } finally {
                      setLookupBusy(false);
                    }
                  }}
                  onSaved={() => void loadInventory(selected.key)}
                  setMessage={setMessage}
                />
              )}

              {tab === "content" && (
                <ContentPanel
                  item={selected}
                  content={content}
                  onChange={touchContent}
                  lint={contentLint ?? detailLint}
                  dirty={contentDirty}
                  saving={savingContent}
                  onLint={() => void saveContent(true)}
                  onSaveNow={() => void saveContent(false)}
                  onReady={async (ready) => {
                    if (!selected.contentDraftId) {
                      setMessage({ kind: "warn", text: "Save some content first — readiness applies to the saved draft." });
                      return;
                    }
                    const j = await post("/api/admin/communities/content", { action: "ready", draftId: selected.contentDraftId, readyForExport: ready });
                    if (j.ok) {
                      setMessage({ kind: "ok", text: ready ? "Content marked READY (server lint clean)." : "Content back to draft." });
                      void loadInventory(selected.key);
                    } else {
                      if (j.lint) setContentLint(j.lint as Lint);
                      setMessage({ kind: "error", text: String(j.error ?? "Ready toggle refused") });
                    }
                  }}
                />
              )}

              {tab === "photos" && (
                <div style={{ padding: 20, maxWidth: 760 }}>
                  <PhotoPanel item={selected} info={photoInfo} onOpen={() => setPhotoModal(true)} onRefresh={() => void loadPhoto(selected.key)} />
                </div>
              )}

              {tab === "status" && selected.kind === "live-page" && (
                <ChecklistPanel item={selected} lint={detailLint} onGoto={(t) => setTab(t)} />
              )}

              {tab === "preview" && selected.kind === "draft" && (
                <PreviewLifecyclePanel
                  item={selected}
                  facts={facts}
                  lint={detailLint}
                  onGoto={(t) => setTab(t)}
                  onReadyToggle={async (ready) => {
                    // studio gate: unverified new-build claims block READY
                    if (ready && facts?.type === "new_build" && facts.builders_count == null && !facts.builders_label?.trim()) {
                      setMessage({ kind: "error", text: "READY refused: the builder claim is unverified — set a verified builder count or a generic label in FACTS & MLS." });
                      return;
                    }
                    const j = await post("/api/admin/communities", { action: "update", draftId: selected.draftId, readyForExport: ready });
                    if (j.ok) {
                      setMessage({ kind: "ok", text: ready ? "Community marked READY for the CB-2 exporter." : "Community back to draft." });
                      void loadInventory(selected.key);
                    } else setMessage({ kind: "error", text: String(j.error ?? "Refused") });
                  }}
                  onArchive={async () => {
                    if (!window.confirm(`Archive the draft for ${selected.name}? The slug frees up; the audited row is kept.`)) return;
                    const j = await post("/api/admin/communities", { action: "archive", draftId: selected.draftId, notes: "archived from Community Studio" });
                    if (j.ok) {
                      setMessage({ kind: "ok", text: "Draft archived (audited)." });
                      select(null);
                      void loadInventory();
                    } else setMessage({ kind: "error", text: String(j.error ?? "Archive refused") });
                  }}
                />
              )}
            </div>
          </>
        )}
      </main>

      {newOpen && (
        <NewCommunityModal
          existing={items}
          onClose={() => setNewOpen(false)}
          onCreated={(key) => {
            setNewOpen(false);
            void loadInventory().then(() => select(key, "facts"));
          }}
          setMessage={setMessage}
        />
      )}

      {photoModal && selected && (
        <PickPhotoModal
          entity="neighborhood"
          city={selected.key}
          displayName={selected.name}
          info={photoInfo}
          onClose={() => setPhotoModal(false)}
          onRefresh={() => void loadPhoto(selected.key)}
        />
      )}
    </div>
  );
}

/* ======================================================= sub-panels */
function IdentityPanel({ facts, draftId, onSaved, setMessage }: { facts: Facts; draftId: string; onSaved: () => void; setMessage: (m: { kind: "ok" | "warn" | "error"; text: string }) => void }) {
  const [name, setName] = useState(facts.name);
  const [slug, setSlug] = useState(facts.slug);
  const [slugTouched, setSlugTouched] = useState(true);
  const c = bySlug[facts.city_slug];
  return (
    <div style={{ padding: 20, maxWidth: 640 }}>
      <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.9, color: "rgba(29,25,19,.65)" }}>
        Type and city are fixed after creation (they scope the slug and every collision rule). Archive and recreate to change them.
      </div>
      <Field label="TYPE"><input value={facts.type === "new_build" ? "New Build community" : "Neighborhood"} disabled style={{ ...inputStyle, background: "#efe9db" }} /></Field>
      <Field label="CITY"><input value={`${c?.name ?? facts.city_slug} (canonical dataset)`} disabled style={{ ...inputStyle, background: "#efe9db" }} /></Field>
      <Field label="COMMUNITY NAME">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugifyHood(e.target.value));
          }}
          style={inputStyle}
        />
      </Field>
      <Field label="PAGE SLUG" hint="auto from the name — editable">
        <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} style={inputStyle} />
      </Field>
      <div className="font-mono" style={{ marginTop: 10, fontSize: 11, fontWeight: 700 }}>
        URL WHEN LIVE: <span style={{ color: ORANGE_DARK }}>/city/{facts.city_slug}/{slugifyHood(slug) || "…"}</span>
      </div>
      <button
        type="button"
        className="font-mono"
        style={{ ...btn(true), marginTop: 14 }}
        onClick={async () => {
          const j = await post("/api/admin/communities", { action: "update", draftId, name: name.trim(), slug: slugifyHood(slug) });
          if (j.ok) {
            setMessage({ kind: "ok", text: "Identity saved (collisions re-checked server-side)." });
            onSaved();
          } else setMessage({ kind: "error", text: String(j.error ?? "Refused") });
        }}
      >
        SAVE IDENTITY
      </button>
    </div>
  );
}

function FactsPanel({
  facts,
  draftId,
  lookup,
  lookupBusy,
  onLookup,
  onSaved,
  setMessage,
}: {
  facts: Facts;
  draftId: string;
  lookup: Record<string, unknown> | null;
  lookupBusy: boolean;
  onLookup: () => void;
  onSaved: () => void;
  setMessage: (m: { kind: "ok" | "warn" | "error"; text: string }) => void;
}) {
  const [note, setNote] = useState(facts.note ?? "");
  const [statusLabel, setStatusLabel] = useState(facts.status_label ?? "");
  const [fromLabel, setFromLabel] = useState(facts.from_label ?? "");
  const [buildersCount, setBuildersCount] = useState(facts.builders_count == null ? "" : String(facts.builders_count));
  const [buildersLabel, setBuildersLabel] = useState(facts.builders_label ?? "");
  const nb = facts.type === "new_build";
  const lk = lookup as {
    matches?: number;
    activeCount?: number;
    pendingCount?: number;
    priceBand?: string;
    suggestedFrom?: string;
    aliases?: string[];
    builders?: string[];
    homonyms?: string[];
    [k: string]: unknown;
  } | null;

  const save = async (extra: Record<string, unknown> = {}) => {
    const j = await post("/api/admin/communities", {
      action: "update",
      draftId,
      note,
      ...(nb ? { statusLabel: statusLabel || undefined, fromLabel: fromLabel || undefined, buildersCount: buildersCount === "" ? null : Number(buildersCount), buildersLabel } : {}),
      ...extra,
    });
    if (j.ok) {
      setMessage({ kind: "ok", text: "Facts saved." });
      onSaved();
    } else setMessage({ kind: "error", text: String(j.error ?? "Refused") });
  };

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <Field label="SHORT POSITIONING NOTE" hint="editorial; the claims linter screens what you write">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={160} style={{ ...inputStyle, resize: "vertical" }} />
      </Field>

      {nb && (
        <>
          <Field label="COMMUNITY STATUS">
            <select value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)} style={inputStyle}>
              {["NOW SELLING", "MODELS OPEN", "FINAL PHASE", "SOLD OUT"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="FROM-PRICE EDITORIAL LABEL" hint='e.g. "$230s" — never an exact price'>
            <input value={fromLabel} onChange={(e) => setFromLabel(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="BUILDER COUNT (VERIFIED ONLY)" hint="leave empty + use the generic label when unverified">
            <input value={buildersCount} onChange={(e) => setBuildersCount(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
          </Field>
          <Field label="GENERIC BUILDERS LABEL" hint='fallback like "SEVERAL BUILDERS" when the count is weak'>
            <input value={buildersLabel} onChange={(e) => setBuildersLabel(e.target.value)} style={inputStyle} />
          </Field>
          <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: ORANGE_DARK, marginTop: 8 }}>
            <Lock size={11} style={{ verticalAlign: "-1px" }} /> Inventory-band eligibility and publication stay in the NEW BUILDS desk — the studio never flips a band.
          </div>
        </>
      )}

      <div style={{ borderTop: "1.5px solid rgba(29,25,19,.25)", marginTop: 18, paddingTop: 12 }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em" }}>MLS LOOKUP — READ-ONLY EVIDENCE</div>
        <p className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: "rgba(29,25,19,.6)", margin: "6px 0 8px" }}>
          Scans our replicated listings for “{facts.name}” in {bySlug[facts.city_slug]?.name}. Results are EVIDENCE — nothing becomes a public claim unless you accept it into a field yourself.
        </p>
        <button type="button" className="font-mono" style={btn()} onClick={onLookup} disabled={lookupBusy}>
          <RefreshCw size={13} /> {lookupBusy ? "SCANNING…" : lookup ? "RE-RUN LOOKUP" : "RUN MLS LOOKUP"}
        </button>
        {lk && (
          <div className="font-mono" style={{ fontSize: 10.5, lineHeight: 2, marginTop: 10, border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
            <div style={{ fontWeight: 700 }}>EVIDENCE (frozen into the draft on save):</div>
            {Object.entries(lk).map(([k, v]) => (
              <div key={k}>
                {k.toUpperCase()}: {Array.isArray(v) ? (v.length ? v.join(" · ") : "—") : String(v ?? "—")}
              </div>
            ))}
            {Array.isArray(lk.homonyms) && lk.homonyms.length > 0 && (
              <div style={{ color: ORANGE_DARK, fontWeight: 700 }}>⚠ HOMONYM WARNING — same name elsewhere; keep the city scope in mind.</div>
            )}
            {Array.isArray(lk.builders) && lk.builders.length > 0 && (
              <div style={{ color: "#8a6d1a" }}>BUILDER NAMES ARE UNVERIFIED MLS ARTIFACTS — do not publish them without verification.</div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {nb && typeof lk.suggestedFrom === "string" && lk.suggestedFrom && (
                <button type="button" className="font-mono" style={btn()} onClick={() => setFromLabel(String(lk.suggestedFrom))}>
                  ACCEPT “{String(lk.suggestedFrom)}” AS FROM-LABEL
                </button>
              )}
              <button type="button" className="font-mono" style={btn(true)} onClick={() => void save({ mlsSnapshot: lk })}>
                SAVE FACTS + FREEZE EVIDENCE
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="button" className="font-mono" style={{ ...btn(true), marginTop: 16 }} onClick={() => void save()}>
        SAVE FACTS
      </button>
    </div>
  );
}

function Counter({ len, min, max }: { len: number; min: number; max: number }) {
  const bad = len > 0 && (len < min || len > max);
  return (
    <span className="font-mono" style={{ fontSize: 9, marginLeft: 8, color: bad ? ORANGE_DARK : "rgba(29,25,19,.45)" }}>
      {len}/{min}–{max}
    </span>
  );
}

function ContentPanel({
  item,
  content,
  onChange,
  lint,
  dirty,
  saving,
  onLint,
  onSaveNow,
  onReady,
}: {
  item: StudioItem;
  content: ContentFields;
  onChange: (p: Partial<ContentFields>) => void;
  lint: Lint | null;
  dirty: boolean;
  saving: boolean;
  onLint: () => void;
  onSaveNow: () => void;
  onReady: (ready: boolean) => void;
}) {
  const nb = item.type === "new_build";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 0, height: "100%" }}>
      <div style={{ padding: 20, overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
          The CB-3a Content Desk fields, saved to the SAME drafts the desk and exporter use. Autosaves after you pause; the server lint runs on save and again (strictly) on READY and at export. Content reaches the public page only via the reviewed content export — never silently.
        </div>
        <Field label="SEO TITLE">
          <input value={content.seoTitle} onChange={(e) => onChange({ seoTitle: e.target.value })} style={inputStyle} />
          <Counter len={content.seoTitle.length} min={25} max={60} />
        </Field>
        <Field label="META DESCRIPTION">
          <textarea value={content.seoDescription} onChange={(e) => onChange({ seoDescription: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <Counter len={content.seoDescription.length} min={70} max={160} />
        </Field>
        <Field label="TAGLINE"><input value={content.tagline} onChange={(e) => onChange({ tagline: e.target.value })} style={inputStyle} /></Field>
        <Field label="INTRO PARAGRAPHS" hint="separate paragraphs with a blank line (min 2 ¶ / 300 chars to pass lint)">
          <textarea value={content.intro} onChange={(e) => onChange({ intro: e.target.value })} rows={7} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <Field label="HOMES & REAL-ESTATE COPY">
          <textarea value={content.homesCopy} onChange={(e) => onChange({ homesCopy: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <Field label="HIGHLIGHTS">
          {content.highlights.map((hl, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={hl.title} placeholder="Title" onChange={(e) => onChange({ highlights: content.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} style={{ ...inputStyle, width: 180 }} />
              <input value={hl.note} placeholder="Note" onChange={(e) => onChange({ highlights: content.highlights.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} style={inputStyle} />
              <button type="button" className="font-mono" style={btn(false, true)} onClick={() => onChange({ highlights: content.highlights.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="font-mono" style={btn()} onClick={() => onChange({ highlights: [...content.highlights, { title: "", note: "" }] })}>+ HIGHLIGHT</button>
        </Field>
        <Field label="FAQS" hint="min 2 entries, answers ≥ 40 chars">
          {content.faq.map((f, i) => (
            <div key={i} style={{ border: "1.5px solid rgba(29,25,19,.25)", borderRadius: 8, padding: 8, marginBottom: 6 }}>
              <input value={f.q} placeholder="Question" onChange={(e) => onChange({ faq: content.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} style={inputStyle} />
              <textarea value={f.a} placeholder="Answer" rows={2} onChange={(e) => onChange({ faq: content.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} style={{ ...inputStyle, marginTop: 6, resize: "vertical" }} />
              <button type="button" className="font-mono" style={{ ...btn(false, true), marginTop: 6 }} onClick={() => onChange({ faq: content.faq.filter((_, j) => j !== i) })}>REMOVE</button>
            </div>
          ))}
          <button type="button" className="font-mono" style={btn()} onClick={() => onChange({ faq: [...content.faq, { q: "", a: "" }] })}>+ FAQ</button>
        </Field>
        {nb && (
          <>
            <Field label="AMENITIES" hint="one per line"><textarea value={content.amenities} onChange={(e) => onChange({ amenities: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>
            <Field label="BUYER NOTES" hint="one per line"><textarea value={content.buyerNotes} onChange={(e) => onChange({ buyerNotes: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          </>
        )}
        <Field label="COMPARISON LINKS (OPTIONAL)">
          {content.links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={l.label} placeholder="Label" onChange={(e) => onChange({ links: content.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ ...inputStyle, width: 180 }} />
              <input value={l.href} placeholder="/city/…" onChange={(e) => onChange({ links: content.links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) })} style={inputStyle} />
              <button type="button" className="font-mono" style={btn(false, true)} onClick={() => onChange({ links: content.links.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="font-mono" style={btn()} onClick={() => onChange({ links: [...content.links, { label: "", href: "" }] })}>+ LINK</button>
        </Field>
      </div>

      <aside style={{ borderLeft: `2px solid ${INK}`, background: CARD, padding: 14, overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em" }}>SERVER LINT</div>
        <div className="font-mono" style={{ fontSize: 9.5, margin: "6px 0", color: dirty ? ORANGE_DARK : "rgba(29,25,19,.55)" }}>
          {saving ? "SAVING…" : dirty ? "UNSAVED — autosaves shortly" : "SAVED"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="font-mono" style={btn()} onClick={onSaveNow}>SAVE NOW</button>
          <button type="button" className="font-mono" style={btn()} onClick={onLint}>LINT NOW</button>
        </div>
        {lint ? (
          <div className="font-mono" style={{ fontSize: 10, lineHeight: 1.9, marginTop: 10 }}>
            {lint.errors.length === 0 && lint.warnings.length === 0 && <div style={{ color: GREEN, fontWeight: 700 }}>✓ CLEAN</div>}
            {lint.errors.map((e, i) => (
              <div key={i} style={{ color: ORANGE_DARK }}>⛔ {e.field}: {e.message}</div>
            ))}
            {lint.warnings.map((w, i) => (
              <div key={i} style={{ color: "#8a6d1a" }}>⚠ {w.field}: {w.message}</div>
            ))}
          </div>
        ) : (
          <div className="font-mono" style={{ fontSize: 9.5, marginTop: 10, color: "rgba(29,25,19,.5)" }}>No lint run yet.</div>
        )}
        <div style={{ borderTop: "1.5px solid rgba(29,25,19,.25)", marginTop: 12, paddingTop: 10 }}>
          <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
            Content lifecycle: <b>{item.contentLifecycle ?? "no draft yet"}</b>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="font-mono" style={btn(true)} onClick={() => onReady(true)}>MARK CONTENT READY</button>
            <button type="button" className="font-mono" style={btn()} onClick={() => onReady(false)}>BACK TO DRAFT</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PhotoPanel({ item, info, onOpen, onRefresh }: { item: StudioItem; info: PickPhotoInfo | null; onOpen: () => void; onRefresh: () => void }) {
  return (
    <div>
      <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em" }}>HERO SLOT — VIA THE PHOTO DESK</div>
      <p className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.8, color: "rgba(29,25,19,.6)" }}>
        The page renders its hero column ONLY when an approved asset exists. Uploads become PENDING candidates; approval, unpublish, and replacement stay the Photo Desk&rsquo;s audited actions.
      </p>
      {!info ? (
        <div className="font-mono" style={{ fontSize: 10 }}>CHECKING THE PHOTO DESK…</div>
      ) : info.asset ? (
        <div style={{ maxWidth: 520 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.asset.public_image_url} alt={info.asset.alt_text} style={{ width: "100%", borderRadius: 10, border: `2px solid ${INK}` }} />
          <div className="font-mono" style={{ fontSize: 10, lineHeight: 2, marginTop: 8 }}>
            <div>ATTRIBUTION: {info.asset.attribution_text}</div>
            <div>LICENSE: {info.asset.license}</div>
            <div>ALT: {info.asset.alt_text}</div>
            <div>CAPTION: {info.asset.caption ?? "—"}</div>
            <div>APPROVED BY: {info.asset.approved_by}</div>
          </div>
        </div>
      ) : (
        <div className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.9, background: "rgba(193,62,23,.08)", border: `1.5px solid ${ORANGE_DARK}`, borderRadius: 10, padding: "10px 12px", color: ORANGE_DARK, maxWidth: 520 }}>
          NO APPROVED HERO PHOTO FOR {item.name.toUpperCase()}. The public page renders its text layout; export/publication gates flag it.
        </div>
      )}
      {info && info.pendingCandidates > 0 && (
        <div className="font-mono" style={{ fontSize: 10, marginTop: 8, color: "#8a6d1a" }}>
          {info.pendingCandidates} PENDING CANDIDATE{info.pendingCandidates === 1 ? "" : "S"} awaiting review.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="font-mono" style={btn(true)} onClick={onOpen}><Camera size={14} /> CHANGE PHOTO…</button>
        <a href="/admin/photos" target="_blank" rel="noreferrer" className="font-mono" style={{ ...btn(), textDecoration: "none" }}><ExternalLink size={13} /> OPEN PHOTO DESK</a>
        <button type="button" className="font-mono" style={btn()} onClick={onRefresh}><RefreshCw size={13} /> REFRESH</button>
      </div>
    </div>
  );
}

function Gate({ ok, label, action, onGoto }: { ok: boolean; label: string; action?: { tab: string; text: string }; onGoto: (t: string) => void }) {
  return (
    <div className="font-mono" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10.5, padding: "5px 0" }}>
      {ok ? <CheckCircle2 size={14} color={GREEN} /> : <XCircle size={14} color={ORANGE_DARK} />}
      <span style={{ flex: 1, color: ok ? "rgba(29,25,19,.75)" : ORANGE_DARK }}>{label}</span>
      {!ok && action && (
        <button type="button" className="font-mono" onClick={() => onGoto(action.tab)} style={{ border: "none", background: "none", color: ORANGE_DARK, fontWeight: 700, fontSize: 9.5, cursor: "pointer", textDecoration: "underline" }}>
          {action.text}
        </button>
      )}
    </div>
  );
}

function ChecklistPanel({ item, lint, onGoto }: { item: StudioItem; lint: Lint | null; onGoto: (t: string) => void }) {
  return (
    <div style={{ padding: 20, maxWidth: 680 }}>
      <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em" }}>PAGE STATUS — {item.name.toUpperCase()}</div>
      <div style={{ marginTop: 10 }}>
        <Gate ok label={`Live page at /city/${item.key} (dataset-owned)`} onGoto={onGoto} />
        <Gate ok={item.heroApproved} label={item.heroApproved ? "Approved hero photo" : "No approved hero photo — the page renders text-only"} action={{ tab: "photos", text: "FIX IN PHOTOS" }} onGoto={onGoto} />
        <Gate ok={!lint || lint.errors.length === 0} label={lint && lint.errors.length ? `${lint.errors.length} content lint error(s) block the next content export` : "Content lint clean (or no custom content draft)"} action={{ tab: "content", text: "FIX IN CONTENT" }} onGoto={onGoto} />
        <Gate ok={item.mlsMatched || item.type === "hood"} label={item.mlsMatched ? "MLS evidence on file" : "No MLS evidence recorded (new-build facts unverified)"} action={{ tab: "content", text: "SEE CONTENT" }} onGoto={onGoto} />
        <Gate ok label={item.hasPageLayout ? "Page-specific layout override PUBLISHED (this page only)" : "No layout override — the shared hood template renders this page"} onGoto={onGoto} />
      </div>
      <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.9, color: "rgba(29,25,19,.6)", marginTop: 14, borderTop: "1.5px solid rgba(29,25,19,.2)", paddingTop: 10 }}>
        PAGE CANVAS publishes layout/region overrides for THIS PAGE via the normal Save Draft → Preview → Publish flow (audited, versioned, revalidates exactly /city/{item.key}).
        <br />CONTENT & SEO drafts export via the reviewed CB-3b content flow. The shared hood template is edited only from Visual Builder → Pages → Hood template, which warns about every affected page.
      </div>
    </div>
  );
}

function PreviewLifecyclePanel({
  item,
  facts,
  lint,
  onGoto,
  onReadyToggle,
  onArchive,
}: {
  item: StudioItem;
  facts: Facts | null;
  lint: Lint | null;
  onGoto: (t: string) => void;
  onReadyToggle: (ready: boolean) => void;
  onArchive: () => void;
}) {
  const buildersOk = item.type === "hood" || facts == null || facts.builders_count != null || !!facts.builders_label?.trim();
  const gates = {
    identity: true, // create/update enforce slug + collisions server-side
    mls: item.mlsMatched,
    content: item.hasCustomContent && item.contentLintErrors === 0 && (!lint || lint.errors.length === 0),
    photo: item.heroApproved,
    builders: buildersOk,
  };
  const allOk = Object.values(gates).every(Boolean);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", height: "100%" }}>
      <div style={{ minWidth: 0, borderRight: `2px solid ${INK}`, display: "flex", flexDirection: "column" }}>
        <div className="font-mono" style={{ padding: "6px 12px", fontSize: 9.5, letterSpacing: ".12em", background: INK, color: "#E88D6B", display: "flex", gap: 10, alignItems: "center" }}>
          <Eye size={13} /> PRIVATE PREVIEW — REAL {item.type === "new_build" ? "NEW-BUILD" : "NEIGHBORHOOD"} TEMPLATE · NOINDEX · ANONYMOUS = 404
          <span style={{ flex: 1 }} />
          <a href={`/admin/editor/community-preview/${item.draftId}`} target="_blank" rel="noreferrer" style={{ color: CREAM }}>OPEN IN TAB ↗</a>
        </div>
        <iframe src={`/admin/editor/community-preview/${item.draftId}`} title="Private community draft preview" style={{ flex: 1, border: "none", background: CREAM }} />
      </div>
      <aside style={{ background: CARD, padding: 16, overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em" }}>LIFECYCLE — {item.lifecycle.toUpperCase()}</div>
        <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.9, color: "rgba(29,25,19,.6)", margin: "6px 0 10px" }}>
          Draft → Ready → Exported (CB-2, reviewed PR) → Deployed → Live. The studio never fakes a URL being live — the exporter, PR review, deploy, and mark-live steps stay exactly as built.
        </div>
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", marginTop: 6 }}>READINESS GATES</div>
        <Gate ok={gates.identity} label="Identity valid — slug + collisions enforced on every save" onGoto={onGoto} />
        <Gate ok={gates.mls} label={gates.mls ? "MLS evidence frozen on the draft" : "MLS lookup not run / not saved"} action={{ tab: "facts", text: "RUN IN FACTS" }} onGoto={onGoto} />
        <Gate ok={gates.builders} label={gates.builders ? "Builder claim verified or generic" : "Unverified builder claim (blocks READY)"} action={{ tab: "facts", text: "FIX IN FACTS" }} onGoto={onGoto} />
        <Gate ok={gates.content} label={gates.content ? "Content drafted + lint clean" : item.hasCustomContent ? "Content lint errors" : "No page content drafted"} action={{ tab: "content", text: "FIX IN CONTENT" }} onGoto={onGoto} />
        <Gate ok={gates.photo} label={gates.photo ? "Approved hero photo" : "No approved hero photo (blocks export sign-off)"} action={{ tab: "photos", text: "FIX IN PHOTOS" }} onGoto={onGoto} />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {item.lifecycle === "draft" && (
            <button type="button" className="font-mono" style={{ ...btn(true), opacity: allOk ? 1 : 0.55 }} title={allOk ? undefined : "Gates above must pass"} onClick={() => onReadyToggle(true)}>
              MARK READY
            </button>
          )}
          {item.lifecycle === "ready" && (
            <button type="button" className="font-mono" style={btn()} onClick={() => onReadyToggle(false)}>BACK TO DRAFT</button>
          )}
          {(item.lifecycle === "draft" || item.lifecycle === "ready") && (
            <button type="button" className="font-mono" style={btn(false, true)} onClick={onArchive}><Archive size={13} /> ARCHIVE</button>
          )}
        </div>

        {item.lifecycle === "ready" && (
          <div className="font-mono" style={{ fontSize: 9.5, lineHeight: 1.9, marginTop: 12, border: `1.5px solid ${INK}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
            <b>PREPARE FOR EXPORT (CB-2 — reviewed code step):</b>
            <br />1. <code>node scripts/content/export-community-drafts.mjs --diff</code>
            <br />2. Review the literal dataset insertions.
            <br />3. <code>--apply</code> on a branch → PR → human review → merge.
            <br />4. Deploy, probe the new URL, then <code>--mark-live</code>.
            <br />The page then appears here as a LIVE page automatically.
          </div>
        )}
      </aside>
    </div>
  );
}

function NewCommunityModal({
  existing,
  onClose,
  onCreated,
  setMessage,
}: {
  existing: StudioItem[];
  onClose: () => void;
  onCreated: (key: string) => void;
  setMessage: (m: { kind: "ok" | "warn" | "error"; text: string }) => void;
}) {
  const [type, setType] = useState<"hood" | "new_build">("hood");
  const [citySlug, setCitySlug] = useState("");
  const [cityQ, setCityQ] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const effSlug = slugifyHood(slugTouched ? slug : name);
  const cityMatches = cityQ.trim() ? cities.filter((c) => c.name.toLowerCase().includes(cityQ.trim().toLowerCase())).slice(0, 6) : [];
  const localCollision = citySlug && effSlug ? existing.find((i) => i.citySlug === citySlug && i.slug === effSlug && i.lifecycle !== "archived") : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(29,25,19,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: CREAM, border: `2px solid ${INK}`, borderRadius: 16, padding: "20px 22px", width: 520, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".16em", color: ORANGE_DARK }}>NEW COMMUNITY — STEP 1 · IDENTITY</div>
        <Field label="TYPE">
          <div style={{ display: "flex", gap: 6 }}>
            {(["hood", "new_build"] as const).map((t) => (
              <button key={t} type="button" className="font-mono" onClick={() => setType(t)} style={{ ...btn(type === t), flex: 1, justifyContent: "center" }}>
                {t === "hood" ? "NEIGHBORHOOD" : "NEW BUILD"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="CITY (CANONICAL DATASET)">
          <input value={cityQ} onChange={(e) => { setCityQ(e.target.value); setCitySlug(""); }} placeholder="Type to search the 90 cities…" style={inputStyle} />
          {citySlug && <div className="font-mono" style={{ fontSize: 10, marginTop: 4, color: GREEN, fontWeight: 700 }}>✓ {bySlug[citySlug]?.name}</div>}
          {!citySlug && cityMatches.length > 0 && (
            <div style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, marginTop: 4, overflow: "hidden", background: "#fff" }}>
              {cityMatches.map((c) => (
                <button key={c.slug} type="button" onClick={() => { setCitySlug(c.slug); setCityQ(c.name); }} style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid rgba(29,25,19,.1)", background: "transparent", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="COMMUNITY NAME">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="PAGE SLUG" hint="auto from the name — editable">
          <input value={slugTouched ? slug : effSlug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} style={inputStyle} />
        </Field>
        <div className="font-mono" style={{ marginTop: 10, fontSize: 11, fontWeight: 700 }}>
          PROPOSED URL: <span style={{ color: ORANGE_DARK }}>/city/{citySlug || "…"}/{effSlug || "…"}</span>
        </div>
        {localCollision && (
          <div className="font-mono" style={{ fontSize: 10, color: ORANGE_DARK, marginTop: 6, fontWeight: 700 }}>
            ⛔ COLLIDES with {localCollision.kind === "live-page" ? "the live page" : "an active draft"} “{localCollision.name}” — the server enforces this plus name-global (Wellington-style) collisions.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            className="font-mono"
            disabled={busy || !citySlug || !name.trim() || !effSlug || !!localCollision}
            style={{ ...btn(true), flex: 1, justifyContent: "center", opacity: busy || !citySlug || !name.trim() || !effSlug || !!localCollision ? 0.5 : 1 }}
            onClick={async () => {
              setBusy(true);
              try {
                const j = await post("/api/admin/communities", { action: "create", type, citySlug, name: name.trim(), slug: effSlug });
                if (j.ok) {
                  setMessage({ kind: "ok", text: `Draft created — /city/${citySlug}/${effSlug} is reserved (private until exported).` });
                  onCreated(`${citySlug}/${effSlug}`);
                } else {
                  setMessage({ kind: "error", text: String(j.error ?? "Create refused") });
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            CREATE DRAFT
          </button>
          <button type="button" className="font-mono" style={{ ...btn(), flex: 1, justifyContent: "center" }} onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}
