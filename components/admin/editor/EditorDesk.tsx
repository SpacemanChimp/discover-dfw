"use client";
/* The EDITOR desk workspace — three panes:
     left   · searchable page/region navigator (grouped, status-dotted)
     center · rich-text / text / FAQ editor + SEO fields
     right  · status, preview, publish controls, version history

   The page tree comes from the CODE-OWNED registry (client-safe pure
   data); the API supplies only statuses and content. Save Draft is the
   explicit durable action; nothing here can touch a public page except
   the Publish confirmation, which calls the atomic publish API. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allPages, type PageDef, type RegionDef } from "@/lib/editor/registry";
import { SEO_TITLE_MAX, SEO_DESC_MAX, isAllowedLinkHref, type PMNode } from "@/lib/editor/doc";
import RichEditor, { type RichEditorHandle } from "./RichEditor";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";
const ORANGE_DARK = "#C13E17";

type Status = "fallback" | "draft" | "published" | "published+draft";

interface VersionMeta {
  versionNo: number;
  status: string;
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  textPreview: string;
}

interface DocDetail {
  migrationApplied?: boolean;
  doc: { id: string } | null;
  draft: { version_no: number; content_json: unknown; seo_title: string | null; seo_description: string | null } | null;
  published: { version_no: number; content_json: unknown; seo_title: string | null; seo_description: string | null } | null;
  baseVersion: number;
  versions: VersionMeta[];
}

interface MediaItem {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  attribution: string;
}

const btn = (primary = false, danger = false): React.CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "center",
  border: `2px solid ${danger ? ORANGE_DARK : INK}`,
  borderRadius: 999,
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".12em",
  cursor: "pointer",
  background: primary ? ORANGE : danger ? "transparent" : CARD,
  color: primary ? CREAM : danger ? ORANGE_DARK : INK,
  marginTop: 8,
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1.5px solid ${INK}`,
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13.5,
  fontFamily: "inherit",
  background: "#fff",
  color: INK,
};

function statusChip(s: Status) {
  const map: Record<Status, { label: string; bg: string; fg: string }> = {
    fallback: { label: "CODE FALLBACK", bg: "rgba(29,25,19,.08)", fg: "rgba(29,25,19,.7)" },
    draft: { label: "DRAFT", bg: "#E9DFC8", fg: INK },
    published: { label: "PUBLISHED OVERRIDE", bg: INK, fg: CREAM },
    "published+draft": { label: "PUBLISHED · DRAFT CHANGES", bg: ORANGE, fg: CREAM },
  };
  const c = map[s];
  return (
    <span className="font-mono" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".14em", background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
}

function dot(s: Status | undefined) {
  const color = s === "published" ? INK : s === "published+draft" ? ORANGE : s === "draft" ? "#C9A24B" : "rgba(29,25,19,.25)";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />;
}

/** images present in a richtext doc — shown in the publish confirmation */
function imagesIn(doc: unknown): { src: string; alt: string; attribution: string }[] {
  const out: { src: string; alt: string; attribution: string }[] = [];
  const walk = (n: PMNode | undefined) => {
    if (!n) return;
    if (n.type === "image") {
      out.push({ src: String(n.attrs?.src ?? ""), alt: String(n.attrs?.alt ?? ""), attribution: String(n.attrs?.attribution ?? "") });
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc as PMNode);
  return out;
}

export default function EditorDesk({ adminEmail, initialRoute }: { adminEmail: string; initialRoute?: string }) {
  const pages = useMemo(() => allPages(), []);
  const groups = useMemo(() => {
    const order = ["Homepage", "Search & editorial", "Cities", "Neighborhoods", "New-build communities", "Static & research"];
    const byGroup = new Map<string, PageDef[]>();
    for (const p of pages) {
      if (!byGroup.has(p.group)) byGroup.set(p.group, []);
      byGroup.get(p.group)!.push(p);
    }
    return order.filter((g) => byGroup.has(g)).map((g) => ({ group: g, pages: byGroup.get(g)! }));
  }, [pages]);

  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [migrationApplied, setMigrationApplied] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [route, setRoute] = useState<string | null>(initialRoute ?? null);
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // editor working state
  const richRef = useRef<RichEditorHandle | null>(null);
  const [textValue, setTextValue] = useState("");
  const [faqItems, setFaqItems] = useState<{ q: string; a: string }[]>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | { kind: "restore" | "archive" | "rollback"; target?: number }>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaLists, setMediaLists] = useState<{ media: MediaItem[]; assets: MediaItem[] } | null>(null);
  const [healNeeded, setHealNeeded] = useState(false);

  const page = route ? pages.find((p) => p.route === route) ?? null : null;
  const region: RegionDef | null = page && regionKey ? page.regions.find((r) => r.key === regionKey) ?? null : null;
  const statusOf = (r: string, k: string): Status => (statuses[`${r}#${k}`] as Status) ?? "fallback";

  /* ---- data loads ---- */
  const loadStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/editor/pages");
      const j = await res.json();
      setMigrationApplied(!!j.migrationApplied);
      setStatuses(j.statuses ?? {});
    } catch {
      setMigrationApplied(false);
    }
  }, []);
  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const loadDetail = useCallback(async (r: string, k: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setMessage(null);
    setHealNeeded(false);
    try {
      const res = await fetch(`/api/admin/editor/doc?route=${encodeURIComponent(r)}&region=${encodeURIComponent(k)}`);
      const j = (await res.json()) as DocDetail & { ok: boolean };
      setDetail(j);
      const live = j.draft ?? j.published;
      const pg = allPages().find((p) => p.route === r)!;
      const def = pg.regions.find((x) => x.key === k)!;
      if (def.contentType === "richtext") {
        richRef.current?.setContent((live?.content_json as object) ?? { type: "doc", content: [{ type: "paragraph" }] });
      } else if (def.contentType === "text") {
        setTextValue(String((live?.content_json as { attrs?: { value?: string } })?.attrs?.value ?? ""));
      } else if (def.contentType === "faq") {
        const items = (live?.content_json as { attrs?: { items?: { q: string; a: string }[] } })?.attrs?.items;
        setFaqItems(Array.isArray(items) && items.length ? items : [{ q: "", a: "" }]);
      }
      setSeoTitle(live?.seo_title ?? "");
      setSeoDescription(live?.seo_description ?? "");
      setDirty(false);
    } catch {
      setMessage({ kind: "error", text: "Failed to load the region — try again." });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const guardDirty = useCallback((): boolean => {
    if (!dirty) return true;
    return window.confirm("You have unsaved changes — discard them?");
  }, [dirty]);

  const selectRegion = useCallback(
    (r: string, k: string) => {
      if (!guardDirty()) return;
      setRoute(r);
      setRegionKey(k);
      loadDetail(r, k);
    },
    [guardDirty, loadDetail]
  );

  // unsaved-changes warning on tab close / navigation
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ---- current content payload ---- */
  const currentContent = useCallback((): unknown => {
    if (!region) return null;
    if (region.contentType === "richtext") return richRef.current?.getContent() ?? null;
    if (region.contentType === "text") return { value: textValue };
    return { items: faqItems };
  }, [region, textValue, faqItems]);

  /* ---- actions ---- */
  async function post(path: string, body: unknown): Promise<{ ok: boolean; [k: string]: unknown }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  const saveDraft = useCallback(async () => {
    if (!route || !regionKey || !detail || !region) return;
    setBusy("save");
    setMessage(null);
    try {
      const j = await post("/api/admin/editor/draft", {
        route,
        regionKey,
        content: currentContent(),
        seoTitle: region.seoEditable ? seoTitle : undefined,
        seoDescription: region.seoEditable ? seoDescription : undefined,
        baseVersion: detail.baseVersion,
      });
      if (j.ok) {
        setMessage({ kind: "ok", text: `Draft saved as v${j.versionNo}` });
        setDirty(false);
        await Promise.all([loadStatuses(), loadDetail(route, regionKey)]);
      } else {
        const errs = (j.errors as string[]) ?? [j.error as string];
        setMessage({ kind: "error", text: errs.filter(Boolean).join(" · ") || "Save failed" });
      }
    } finally {
      setBusy(null);
    }
  }, [route, regionKey, detail, region, currentContent, seoTitle, seoDescription, loadStatuses, loadDetail]);

  const publish = useCallback(async () => {
    if (!route || !regionKey || !detail?.draft) return;
    setBusy("publish");
    setConfirmPublish(false);
    try {
      const j = await post("/api/admin/editor/publish", { route, regionKey, versionNo: detail.draft.version_no });
      if (j.ok) {
        if (j.revalidated) {
          setMessage({ kind: "ok", text: String(j.note ?? "Published") });
        } else {
          setMessage({ kind: "warn", text: String(j.note ?? "Published, but revalidation failed — run Heal") });
          setHealNeeded(true);
        }
        await Promise.all([loadStatuses(), loadDetail(route, regionKey)]);
      } else {
        const errs = (j.errors as string[]) ?? [j.error as string];
        setMessage({ kind: "error", text: errs.filter(Boolean).join(" · ") || "Publish failed" });
      }
    } finally {
      setBusy(null);
    }
  }, [route, regionKey, detail, loadStatuses, loadDetail]);

  const runConfirmed = useCallback(async () => {
    if (!route || !regionKey || !confirmAction) return;
    const { kind, target } = confirmAction;
    setConfirmAction(null);
    setBusy(kind);
    try {
      const j =
        kind === "restore"
          ? await post("/api/admin/editor/restore", { route, regionKey })
          : kind === "archive"
            ? await post("/api/admin/editor/archive", { route, regionKey })
            : await post("/api/admin/editor/rollback", { route, regionKey, targetVersionNo: target });
      if (j.ok) {
        const revalWarn = j.revalidated === false;
        setMessage(
          revalWarn
            ? { kind: "warn", text: "Done, but revalidation failed — run Heal" }
            : { kind: "ok", text: kind === "restore" ? "Code fallback restored" : kind === "archive" ? "Draft archived" : `Rolled back — v${j.publishedVersion} is live` }
        );
        if (revalWarn) setHealNeeded(true);
        await Promise.all([loadStatuses(), loadDetail(route, regionKey)]);
      } else {
        setMessage({ kind: "error", text: String(j.error ?? "Action failed") });
      }
    } finally {
      setBusy(null);
    }
  }, [route, regionKey, confirmAction, loadStatuses, loadDetail]);

  const heal = useCallback(async () => {
    if (!route) return;
    setBusy("heal");
    try {
      const j = await post("/api/admin/editor/heal", { route });
      setMessage(j.ok ? { kind: "ok", text: "Revalidation heal ran clean" } : { kind: "error", text: String(j.revalidateError ?? "Heal failed") });
      if (j.ok) setHealNeeded(false);
    } finally {
      setBusy(null);
    }
  }, [route]);

  const openMedia = useCallback(async () => {
    setMediaOpen(true);
    if (!mediaLists) {
      try {
        const res = await fetch("/api/admin/editor/media");
        const j = await res.json();
        setMediaLists({
          media: (j.media ?? []).map((m: { id: string; public_url: string; alt_text: string; caption: string | null; attribution_text: string }) => ({
            id: m.id, url: m.public_url, alt: m.alt_text, caption: m.caption, attribution: m.attribution_text,
          })),
          assets: (j.assets ?? []).map((a: { id: string; public_image_url: string; alt_text: string; caption: string | null; attribution_text: string }) => ({
            id: a.id, url: a.public_image_url, alt: a.alt_text, caption: a.caption, attribution: a.attribution_text,
          })),
        });
      } catch {
        setMediaLists({ media: [], assets: [] });
      }
    }
  }, [mediaLists]);

  const insertImage = useCallback((m: MediaItem) => {
    richRef.current?.insertImage({ src: m.url, alt: m.alt, attribution: m.attribution, caption: m.caption ?? "", mediaId: m.id });
    setMediaOpen(false);
    setDirty(true);
  }, []);

  /* ---- navigator filtering ---- */
  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, pages: q ? g.pages.filter((p) => p.title.toLowerCase().includes(q) || p.route.toLowerCase().includes(q)) : g.pages }))
        .filter((g) => g.pages.length),
    [groups, q]
  );

  const draftImages = detail?.draft ? imagesIn(detail.draft.content_json) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "290px 1fr 300px", gap: 0, minHeight: "calc(100vh - 46px)" }} className="ed-desk">
      {/* ------------------------------------------------ left: navigator */}
      <aside style={{ borderRight: `2px solid ${INK}`, background: CARD, overflowY: "auto", maxHeight: "calc(100vh - 46px)", position: "sticky", top: 0 }}>
        <div style={{ padding: "14px 14px 8px" }}>
          <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".22em", color: ORANGE_DARK }}>
            EDITOR DESK
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            aria-label="Search pages"
            style={{ ...inputStyle, marginTop: 10, fontSize: 13 }}
          />
          {migrationApplied === false && (
            <div className="font-mono" style={{ marginTop: 10, fontSize: 9.5, lineHeight: 1.7, letterSpacing: ".06em", background: "#1D1913", color: "#E88D6B", borderRadius: 8, padding: "8px 10px" }}>
              MIGRATION 0018 NOT APPLIED — the desk is read-only and every page renders its code content. Apply
              supabase/migrations/0018_visual_editor.sql to enable editing.
            </div>
          )}
        </div>
        <nav style={{ padding: "0 8px 24px" }}>
          {filteredGroups.map((g) => (
            <details key={g.group} open={g.group === "Homepage" || g.group === "Search & editorial" || !!q}>
              <summary
                className="font-mono"
                style={{ cursor: "pointer", fontSize: 9.5, fontWeight: 700, letterSpacing: ".18em", color: "rgba(29,25,19,.6)", padding: "10px 8px 6px", listStyle: "none" }}
              >
                ▸ {g.group.toUpperCase()} · {g.pages.length}
              </summary>
              {g.pages.map((p) => (
                <div key={p.route} style={{ marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 8px 2px" }}>{p.title}</div>
                  {p.regions.map((r) => {
                    const active = route === p.route && regionKey === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => selectRegion(p.route, r.key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: active ? INK : "transparent",
                          color: active ? CREAM : INK,
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {dot(statusOf(p.route, r.key))}
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </details>
          ))}
        </nav>
      </aside>

      {/* ------------------------------------------------ center: editor */}
      <main style={{ padding: "20px 22px 60px", minWidth: 0 }}>
        {!region || !page ? (
          <div style={{ maxWidth: 560, margin: "80px auto", textAlign: "center" }}>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".22em", color: ORANGE_DARK }}>
              CHOOSE A REGION
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "rgba(29,25,19,.75)", marginTop: 10 }}>
              Pick a page and region on the left. Regions are the approved editorial surfaces — market data, listings,
              filters, disclosures, and navigation stay code-owned and are not editable here.
            </p>
          </div>
        ) : (
          <>
            <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 10, marginBottom: 16, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{region.label}</h1>
              <span className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".08em", color: "rgba(29,25,19,.6)" }}>
                {page.route} · {region.contentType.toUpperCase()}
              </span>
              {statusChip(statusOf(page.route, region.key))}
            </header>

            {loadingDetail ? (
              <div className="font-mono" style={{ fontSize: 11, letterSpacing: ".14em", color: "rgba(29,25,19,.6)" }}>LOADING…</div>
            ) : (
              <>
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".08em", color: "rgba(29,25,19,.55)", marginBottom: 12 }}>
                  FALLBACK SOURCE: {region.fallbackSource} — the code content keeps rendering until you publish an override.
                </div>

                {region.contentType === "richtext" && (
                  <RichEditor
                    ref={richRef}
                    allowImages={region.allowImages}
                    onDirty={() => setDirty(true)}
                    onAddImage={openMedia}
                  />
                )}

                {region.contentType === "text" && (
                  <div>
                    <label className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em" }}>
                      TEXT (single line, max 300 chars)
                      <input
                        value={textValue}
                        onChange={(e) => {
                          setTextValue(e.target.value);
                          setDirty(true);
                        }}
                        maxLength={300}
                        style={{ ...inputStyle, marginTop: 6, fontFamily: "inherit", fontWeight: 400, letterSpacing: 0 }}
                      />
                    </label>
                    <div className="font-mono" style={{ fontSize: 9.5, marginTop: 4, color: "rgba(29,25,19,.55)" }}>{textValue.length}/300</div>
                  </div>
                )}

                {region.contentType === "faq" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {faqItems.map((it, i) => (
                      <fieldset key={i} style={{ border: `1.5px solid ${INK}`, borderRadius: 10, padding: "10px 12px" }}>
                        <legend className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", padding: "0 6px" }}>
                          FAQ {i + 1}
                        </legend>
                        <input
                          value={it.q}
                          placeholder="Question"
                          aria-label={`FAQ ${i + 1} question`}
                          onChange={(e) => {
                            const next = [...faqItems];
                            next[i] = { ...next[i], q: e.target.value };
                            setFaqItems(next);
                            setDirty(true);
                          }}
                          style={{ ...inputStyle, marginBottom: 8 }}
                        />
                        <textarea
                          value={it.a}
                          placeholder="Answer"
                          aria-label={`FAQ ${i + 1} answer`}
                          rows={3}
                          onChange={(e) => {
                            const next = [...faqItems];
                            next[i] = { ...next[i], a: e.target.value };
                            setFaqItems(next);
                            setDirty(true);
                          }}
                          style={{ ...inputStyle, resize: "vertical" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFaqItems(faqItems.filter((_, j) => j !== i));
                            setDirty(true);
                          }}
                          className="font-mono"
                          style={{ marginTop: 6, border: "none", background: "none", color: ORANGE_DARK, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", cursor: "pointer", padding: 0 }}
                        >
                          ✕ REMOVE
                        </button>
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFaqItems([...faqItems, { q: "", a: "" }])}
                      className="font-mono"
                      style={{ ...btn(), width: 220 }}
                    >
                      + ADD FAQ ITEM
                    </button>
                    <p className="font-mono" style={{ fontSize: 9.5, color: "rgba(29,25,19,.55)", margin: 0 }}>
                      PUBLISHED FAQS DRIVE BOTH THE VISIBLE BLOCK AND FAQPAGE JSON-LD — THEY CANNOT DIVERGE.
                    </p>
                  </div>
                )}

                {region.seoEditable && (
                  <section style={{ marginTop: 26, borderTop: `1.5px solid rgba(29,25,19,.25)`, paddingTop: 16 }}>
                    <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: ORANGE_DARK, marginBottom: 10 }}>
                      SEO — OPTIONAL OVERRIDES (canonical stays code-owned)
                    </div>
                    <label className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", display: "block" }}>
                      SEO TITLE
                      <input
                        value={seoTitle}
                        onChange={(e) => {
                          setSeoTitle(e.target.value);
                          setDirty(true);
                        }}
                        style={{ ...inputStyle, marginTop: 6, fontFamily: "inherit", fontWeight: 400, letterSpacing: 0 }}
                      />
                    </label>
                    <div className="font-mono" style={{ fontSize: 9.5, marginTop: 3, color: seoTitle.length > SEO_TITLE_MAX ? ORANGE_DARK : "rgba(29,25,19,.55)" }}>
                      {seoTitle.length}/{SEO_TITLE_MAX}
                    </div>
                    <label className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", display: "block", marginTop: 12 }}>
                      META DESCRIPTION
                      <textarea
                        value={seoDescription}
                        rows={2}
                        onChange={(e) => {
                          setSeoDescription(e.target.value);
                          setDirty(true);
                        }}
                        style={{ ...inputStyle, marginTop: 6, fontFamily: "inherit", fontWeight: 400, letterSpacing: 0, resize: "vertical" }}
                      />
                    </label>
                    <div className="font-mono" style={{ fontSize: 9.5, marginTop: 3, color: seoDescription.length > SEO_DESC_MAX ? ORANGE_DARK : "rgba(29,25,19,.55)" }}>
                      {seoDescription.length}/{SEO_DESC_MAX}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ------------------------------------------------ right: controls */}
      <aside style={{ borderLeft: `2px solid ${INK}`, background: CARD, padding: "16px 16px 40px", overflowY: "auto", maxHeight: "calc(100vh - 46px)", position: "sticky", top: 0 }}>
        {region && page ? (
          <>
            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", color: ORANGE_DARK }}>
              STATUS &amp; PUBLISHING
            </div>
            <div className="font-mono" style={{ fontSize: 10, lineHeight: 2, marginTop: 8, color: "rgba(29,25,19,.75)" }}>
              PUBLISHED: {detail?.published ? `v${detail.published.version_no}` : "— (code fallback)"}
              <br />
              DRAFT: {detail?.draft ? `v${detail.draft.version_no}` : "—"}
              <br />
              {dirty ? <span style={{ color: ORANGE_DARK, fontWeight: 700 }}>UNSAVED CHANGES</span> : "NO UNSAVED CHANGES"}
            </div>

            {message && (
              <div
                className="font-mono"
                role="status"
                style={{
                  marginTop: 10,
                  fontSize: 10,
                  lineHeight: 1.7,
                  letterSpacing: ".04em",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: message.kind === "ok" ? "rgba(29,25,19,.08)" : message.kind === "warn" ? "#C9A24B" : ORANGE_DARK,
                  color: message.kind === "ok" ? INK : CREAM,
                }}
              >
                {message.text}
              </div>
            )}

            <button type="button" onClick={saveDraft} disabled={busy !== null || migrationApplied === false} style={btn(false)} className="font-mono">
              {busy === "save" ? "SAVING…" : "SAVE DRAFT"}
            </button>
            <a
              href={`/api/admin/editor/preview?route=${encodeURIComponent(page.route)}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono"
              style={{ ...btn(false), textDecoration: "none", opacity: detail?.draft ? 1 : 0.5, pointerEvents: detail?.draft ? "auto" : "none" }}
            >
              PREVIEW DRAFT ↗
            </a>
            <button
              type="button"
              onClick={() => setConfirmPublish(true)}
              disabled={busy !== null || !detail?.draft || dirty || migrationApplied === false}
              style={{ ...btn(true), opacity: !detail?.draft || dirty ? 0.5 : 1 }}
              className="font-mono"
              title={dirty ? "Save the draft first" : undefined}
            >
              {busy === "publish" ? "PUBLISHING…" : "PUBLISH…"}
            </button>
            {dirty && (
              <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".08em", color: "rgba(29,25,19,.6)", marginTop: 4 }}>
                SAVE DRAFT BEFORE PUBLISHING — PUBLISH SHIPS THE SAVED DRAFT, NOT THE SCREEN.
              </div>
            )}
            {healNeeded && (
              <button type="button" onClick={heal} disabled={busy !== null} style={btn(false, true)} className="font-mono">
                {busy === "heal" ? "HEALING…" : "⚠ RETRY REVALIDATION (HEAL)"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmAction({ kind: "restore" })}
              disabled={busy !== null || !detail?.published}
              style={{ ...btn(false, true), opacity: detail?.published ? 1 : 0.5 }}
              className="font-mono"
            >
              RESTORE CODE FALLBACK…
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction({ kind: "archive" })}
              disabled={busy !== null || !detail?.draft}
              style={{ ...btn(false), opacity: detail?.draft ? 1 : 0.5 }}
              className="font-mono"
            >
              ARCHIVE DRAFT…
            </button>

            <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", color: ORANGE_DARK, marginTop: 24 }}>
              VERSION HISTORY
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {(detail?.versions ?? []).length === 0 && (
                <div className="font-mono" style={{ fontSize: 10, color: "rgba(29,25,19,.55)" }}>NO VERSIONS YET — THIS REGION IS PURE CODE.</div>
              )}
              {(detail?.versions ?? []).map((v) => (
                <div key={v.versionNo} style={{ border: "1.5px solid rgba(29,25,19,.3)", borderRadius: 8, padding: "8px 10px" }}>
                  <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em" }}>
                    v{v.versionNo} · {v.status.toUpperCase()}
                  </div>
                  <div className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.6)", marginTop: 2 }}>
                    {new Date(v.createdAt).toLocaleString()} · {v.createdBy}
                  </div>
                  {v.textPreview && (
                    <div style={{ fontSize: 11.5, color: "rgba(29,25,19,.75)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {v.textPreview}
                    </div>
                  )}
                  {v.status !== "published" && v.status !== "draft" && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ kind: "rollback", target: v.versionNo })}
                      disabled={busy !== null}
                      className="font-mono"
                      style={{ marginTop: 6, border: "none", background: "none", color: ORANGE_DARK, fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", cursor: "pointer", padding: 0 }}
                    >
                      ⟲ ROLL BACK TO v{v.versionNo}…
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "rgba(29,25,19,.55)", lineHeight: 2 }}>
            SIGNED IN AS {adminEmail.toUpperCase()}
            <br />
            NOTHING PUBLISHES WITHOUT THE EXPLICIT PUBLISH CONFIRMATION.
          </div>
        )}
      </aside>

      {/* ------------------------------------------------ publish confirm */}
      {confirmPublish && detail?.draft && page && region && (
        <Modal onClose={() => setConfirmPublish(false)} title="PUBLISH TO THE PUBLIC SITE">
          <div className="font-mono" style={{ fontSize: 11, lineHeight: 2.1 }}>
            PUBLIC ROUTE: <b>{page.route}</b>
            <br />
            REGION: <b>{region.label}</b>
            <br />
            CURRENT: <b>{detail.published ? `v${detail.published.version_no}` : "code fallback"}</b> → NEW: <b>v{detail.draft.version_no}</b>
            {region.seoEditable && (detail.draft.seo_title || detail.draft.seo_description) && (
              <>
                <br />
                SEO TITLE: {detail.draft.seo_title ?? "—"}
                <br />
                META DESCRIPTION: {detail.draft.seo_description ?? "—"}
              </>
            )}
          </div>
          {draftImages.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em" }}>
                IMAGES GOING PUBLIC ({draftImages.length}):
              </div>
              {draftImages.map((im, i) => (
                <div key={i} className="font-mono" style={{ fontSize: 9.5, color: "rgba(29,25,19,.7)", marginTop: 4 }}>
                  · alt “{im.alt || "MISSING"}” · {im.attribution || "NO ATTRIBUTION"}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(29,25,19,.75)" }}>
            Publishing atomically replaces this region for every public visitor and revalidates {page.revalidatePaths.join(", ")}.
            Prior versions stay in history; Restore Code Fallback undoes the override at any time.
          </p>
          <button type="button" onClick={publish} style={btn(true)} className="font-mono">
            CONFIRM — PUBLISH v{detail.draft.version_no}
          </button>
          <button type="button" onClick={() => setConfirmPublish(false)} style={btn(false)} className="font-mono">
            CANCEL
          </button>
        </Modal>
      )}

      {/* ------------------------------------------------ generic confirms */}
      {confirmAction && page && region && (
        <Modal onClose={() => setConfirmAction(null)} title={confirmAction.kind === "restore" ? "RESTORE CODE FALLBACK" : confirmAction.kind === "archive" ? "ARCHIVE DRAFT" : `ROLL BACK TO v${confirmAction.target}`}>
          <p style={{ fontSize: 13, lineHeight: 1.7 }}>
            {confirmAction.kind === "restore" &&
              `Remove the published override on ${page.route} — the code-owned content becomes public again. Version history and media are preserved.`}
            {confirmAction.kind === "archive" && "Park the current draft. Nothing public changes; the draft moves to history as ARCHIVED."}
            {confirmAction.kind === "rollback" &&
              `Republish v${confirmAction.target}'s content as a new version on ${page.route}. The current published version stays in history.`}
          </p>
          <button type="button" onClick={runConfirmed} style={btn(true)} className="font-mono">
            CONFIRM
          </button>
          <button type="button" onClick={() => setConfirmAction(null)} style={btn(false)} className="font-mono">
            CANCEL
          </button>
        </Modal>
      )}

      {/* ------------------------------------------------ media picker */}
      {mediaOpen && (
        <Modal onClose={() => setMediaOpen(false)} title="ADD IMAGE" wide>
          <MediaPicker lists={mediaLists} onPick={insertImage} onUploaded={(m) => {
            setMediaLists((prev) => (prev ? { ...prev, media: [m, ...prev.media] } : { media: [m], assets: [] }));
            insertImage(m);
          }} />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(29,25,19,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ background: CREAM, border: `3px solid ${INK}`, borderRadius: 14, padding: "18px 20px 20px", width: wide ? "min(860px, 94vw)" : "min(480px, 94vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".2em", color: ORANGE_DARK, marginBottom: 10 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function MediaPicker({
  lists,
  onPick,
  onUploaded,
}: {
  lists: { media: MediaItem[]; assets: MediaItem[] } | null;
  onPick: (m: MediaItem) => void;
  onUploaded: (m: MediaItem) => void;
}) {
  const [tab, setTab] = useState<"existing" | "upload">("existing");
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [attribution, setAttribution] = useState("PHOTO: DISCOVER DFW");
  const [caption, setCaption] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file || !altText.trim() || !attribution.trim() || !rights) {
      setError("File, alt text, attribution, and the rights confirmation are all required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("altText", altText.trim());
      fd.set("attributionText", attribution.trim());
      fd.set("caption", caption.trim());
      fd.set("rightsConfirmed", "true");
      const res = await fetch("/api/admin/editor/media", { method: "POST", body: fd });
      const j = await res.json();
      if (!j.ok) {
        setError(String(j.error ?? "Upload failed"));
        return;
      }
      onUploaded({ id: j.media.id, url: j.media.public_url, alt: j.media.alt_text, caption: j.media.caption, attribution: j.media.attribution_text });
    } finally {
      setBusy(false);
    }
  }

  const grid = (items: MediaItem[], empty: string) =>
    items.length === 0 ? (
      <div className="font-mono" style={{ fontSize: 10, color: "rgba(29,25,19,.55)", padding: "16px 0" }}>{empty}</div>
    ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
        {items.map((m) => (
          <button key={m.id} type="button" onClick={() => onPick(m)} style={{ border: `2px solid ${INK}`, borderRadius: 10, padding: 0, overflow: "hidden", cursor: "pointer", background: "#fff", textAlign: "left" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
            <div className="font-mono" style={{ fontSize: 8.5, padding: "5px 7px", color: "rgba(29,25,19,.7)", lineHeight: 1.5 }}>
              {m.alt.slice(0, 40)}
              <br />
              {m.attribution.slice(0, 32)}
            </div>
          </button>
        ))}
      </div>
    );

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {(["existing", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="font-mono"
            style={{
              border: `2px solid ${INK}`,
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".12em",
              cursor: "pointer",
              background: tab === t ? INK : "transparent",
              color: tab === t ? CREAM : INK,
            }}
          >
            {t === "existing" ? "SELECT EXISTING" : "UPLOAD NEW"}
          </button>
        ))}
      </div>

      {tab === "existing" ? (
        <>
          <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", marginTop: 14 }}>EDITOR UPLOADS</div>
          {grid(lists?.media ?? [], lists ? "No editor uploads yet." : "Loading…")}
          <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", marginTop: 14 }}>APPROVED PHOTO-DESK ASSETS</div>
          {grid(lists?.assets ?? [], lists ? "No approved assets." : "Loading…")}
        </>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose image file" />
          <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Alt text (required)" aria-label="Alt text" style={inputStyle} />
          <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Attribution (required)" aria-label="Attribution" style={inputStyle} />
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" aria-label="Caption" style={inputStyle} />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5 }}>
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 3 }} />
            I confirm Discover DFW has the right to publish this image (owned or licensed). Remote hotlinks and unlicensed
            stock are not accepted.
          </label>
          {error && (
            <div className="font-mono" style={{ fontSize: 10, color: CREAM, background: ORANGE_DARK, borderRadius: 8, padding: "8px 10px" }}>{error}</div>
          )}
          <button type="button" onClick={upload} disabled={busy} style={btn(true)} className="font-mono">
            {busy ? "UPLOADING…" : "UPLOAD + INSERT"}
          </button>
          <p className="font-mono" style={{ fontSize: 9, color: "rgba(29,25,19,.55)", lineHeight: 1.8, margin: 0 }}>
            JPEG/PNG/WEBP · ≥800PX WIDE · ≤4MB · RE-ENCODED SERVER-SIDE (EXIF/GPS STRIPPED) · STORED IN EDITORIAL-PHOTOS/EDITOR
          </p>
        </div>
      )}
    </div>
  );
}

export { isAllowedLinkHref };
