"use client";

/* CB-3a SEO Community Editor client. One page, one draft, one action, one
   request — Photo Desk idiom. Everything here is a DRAFT: publishing is
   the CB-2 exporter's --content mode on a reviewed branch. The lint panel
   is advisory in the browser; the READY toggle re-lints server-side at
   export strictness and refuses on errors, and the exporter re-lints
   again and fails closed. MLS hints are display-only facts — the claims
   linter screens whatever is actually written. */

import { useMemo, useState } from "react";
import type { ContentDraft, LintResult, PageOption } from "@/lib/content/community-content-drafts";
import type { CommunityLookup } from "@/lib/content/mls-community-lookup";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const label: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: INK, textTransform: "uppercase" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1.5px solid ${INK}`, background: "#fff", color: INK, fontSize: 14, borderRadius: 2 };
const area: React.CSSProperties = { ...input, minHeight: 90, fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "8px 14px", border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 12, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer", borderRadius: 2, textTransform: "uppercase" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: INK };

type Form = {
  draftId: string | null;
  seoTitle: string;
  seoDescription: string;
  tagline: string;
  introText: string; // blank-line-separated paragraphs
  homesCopy: string;
  highlights: { title: string; note: string }[];
  faq: { q: string; a: string }[];
  amenitiesText: string; // one per line (nb pages)
  buyerNotesText: string;
  readyForExport: boolean;
  lifecycle: string;
};

const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export default function ContentEditor({
  adminEmail,
  drafts: initialDrafts,
  pages,
}: {
  adminEmail: string;
  drafts: ContentDraft[];
  pages: PageOption[];
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [citySlug, setCitySlug] = useState("");
  const [hoodSlug, setHoodSlug] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [lint, setLint] = useState<LintResult | null>(null);
  const [hints, setHints] = useState<CommunityLookup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [archiveNotes, setArchiveNotes] = useState<string | null>(null);

  const cityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of pages) if (!seen.has(p.citySlug)) seen.set(p.citySlug, p.cityName);
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [pages]);
  const hoodOptions = useMemo(() => pages.filter((p) => p.citySlug === citySlug), [pages, citySlug]);
  const page = useMemo(() => pages.find((p) => p.citySlug === citySlug && p.hoodSlug === hoodSlug) ?? null, [pages, citySlug, hoodSlug]);
  const draftFor = (c: string, h: string) => drafts.find((d) => d.citySlug === c && d.hoodSlug === h) ?? null;

  async function post(path: string, payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setBanner(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return (await res.json()) as { ok: boolean; error?: string; draftId?: string; lint?: LintResult; lookup?: CommunityLookup; auditError?: string | null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      setBusy(null);
    }
  }

  function openPage(c: string, h: string) {
    setCitySlug(c);
    setHoodSlug(h);
    const d = draftFor(c, h);
    setLint(d?.lint ?? null);
    setHints((d?.mlsSnapshot as CommunityLookup | null) ?? null);
    setForm({
      draftId: d?.id ?? null,
      seoTitle: d?.seoTitle ?? "",
      seoDescription: d?.seoDescription ?? "",
      tagline: d?.tagline ?? "",
      introText: (d?.intro ?? []).join("\n\n"),
      homesCopy: d?.homesCopy ?? "",
      highlights: d?.highlights?.length ? d.highlights : [{ title: "", note: "" }],
      faq: d?.faq?.length ? d.faq : [{ q: "", a: "" }],
      amenitiesText: (d?.newBuild?.amenities ?? []).join("\n"),
      buyerNotesText: (d?.newBuild?.buyerNotes ?? []).join("\n"),
      readyForExport: d?.readyForExport ?? false,
      lifecycle: d?.lifecycle ?? "draft",
    });
  }

  function fieldsPayload(f: Form) {
    return {
      seoTitle: f.seoTitle,
      seoDescription: f.seoDescription,
      tagline: f.tagline,
      intro: paragraphs(f.introText),
      homesCopy: f.homesCopy,
      highlights: f.highlights.filter((h) => h.title.trim() || h.note.trim()),
      faq: f.faq.filter((x) => x.q.trim() || x.a.trim()),
      newBuild:
        page?.isNewBuild && (f.amenitiesText.trim() || f.buyerNotesText.trim())
          ? { amenities: lines(f.amenitiesText), buyerNotes: lines(f.buyerNotesText) }
          : null,
      mlsSnapshot: hints ?? undefined,
    };
  }

  async function runLint() {
    if (!form) return;
    const r = await post("/api/admin/communities/content", { action: "lint", draftId: form.draftId, citySlug, hoodSlug, fields: fieldsPayload(form), readyForExport: true }, "lint");
    if (!r.ok || !r.lint) return setBanner(`LINT FAILED — ${r.error}`);
    setLint(r.lint);
  }

  async function runHints() {
    if (!page) return;
    const r = await post("/api/admin/communities/lookup", { name: page.hoodName, citySlug }, "hints");
    if (!r.ok || !r.lookup) return setBanner(`HINTS FAILED — ${r.error}`);
    setHints(r.lookup);
  }

  async function save() {
    if (!form) return;
    const r = await post("/api/admin/communities/content", { action: "save", draftId: form.draftId, citySlug, hoodSlug, fields: fieldsPayload(form) }, "save");
    if (!r.ok) return setBanner(`SAVE FAILED — ${r.error}`);
    const id = form.draftId ?? r.draftId ?? "new";
    const now = new Date().toISOString();
    const saved: ContentDraft = {
      id,
      citySlug,
      hoodSlug,
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      tagline: form.tagline.trim() || null,
      intro: paragraphs(form.introText),
      homesCopy: form.homesCopy.trim() || null,
      highlights: form.highlights.filter((h) => h.title.trim() || h.note.trim()),
      faq: form.faq.filter((x) => x.q.trim() || x.a.trim()),
      newBuild: page?.isNewBuild && (form.amenitiesText.trim() || form.buyerNotesText.trim()) ? { amenities: lines(form.amenitiesText), buyerNotes: lines(form.buyerNotesText) } : null,
      links: [],
      mlsSnapshot: (hints as unknown as Record<string, unknown>) ?? null,
      lint,
      readyForExport: false, // any save drops readiness (server does the same)
      lifecycle: "draft",
      createdBy: adminEmail,
      updatedAt: now,
    };
    setDrafts((prev) => [saved, ...prev.filter((d) => d.id !== id)]);
    setForm({ ...form, draftId: id, readyForExport: false, lifecycle: "draft" });
    setBanner(`SAVED ${citySlug}/${hoodSlug} — DRAFT${r.auditError ? ` ⚠ AUDIT ROW FAILED (${r.auditError})` : ""}. Content does not publish; the exporter is a separate gate.`);
  }

  async function toggleReady(next: boolean) {
    if (!form?.draftId) return;
    const r = await post("/api/admin/communities/content", { action: "ready", draftId: form.draftId, readyForExport: next }, "ready");
    if (r.lint) setLint(r.lint);
    if (!r.ok) return setBanner(`READY REFUSED — ${r.error}`);
    setForm({ ...form, readyForExport: next, lifecycle: next ? "ready" : "draft" });
    setDrafts((prev) => prev.map((d) => (d.id === form.draftId ? { ...d, readyForExport: next, lifecycle: next ? "ready" : "draft" } : d)));
    setBanner(next ? `READY FOR EXPORT ✓ (lint clean) — the exporter/PR remains the publish gate.` : "Back to DRAFT.");
  }

  async function archive() {
    if (!form?.draftId || archiveNotes === null) return;
    const r = await post("/api/admin/communities/content", { action: "archive", draftId: form.draftId, notes: archiveNotes }, "archive");
    if (!r.ok) return setBanner(`ARCHIVE FAILED — ${r.error}`);
    setDrafts((prev) => prev.filter((d) => d.id !== form.draftId));
    setArchiveNotes(null);
    setForm(null);
  }

  const counter = (v: string, min: number, max: number) => (
    <span style={{ fontSize: 11, color: v && (v.length < min || v.length > max) ? ORANGE : "#5a5348" }}>
      {v.length}/{min}–{max}
    </span>
  );

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>CONTENT DESK</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
              SEO/EDITORIAL DRAFTS FOR EXISTING PAGES — PUBLISHING IS THE GATED EXPORTER · SIGNED IN AS {adminEmail.toUpperCase()}
            </p>
          </div>
          <a href="/admin/communities" style={{ ...btnGhost, textDecoration: "none" }}>
            ← DRAFTS DESK
          </a>
        </header>

        {banner && (
          <div style={{ border: `2px solid ${banner.includes("FAILED") || banner.includes("REFUSED") ? ORANGE : INK}`, background: CARD, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {banner}
          </div>
        )}

        {/* ---- page picker ---- */}
        <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ minWidth: 220 }}>
            <div style={label}>City</div>
            <select style={input} value={citySlug} onChange={(e) => { setCitySlug(e.target.value); setHoodSlug(""); setForm(null); }}>
              <option value="">— pick a city —</option>
              {cityOptions.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 300 }}>
            <div style={label}>Page</div>
            <select style={input} value={hoodSlug} onChange={(e) => e.target.value && openPage(citySlug, e.target.value)} disabled={!citySlug}>
              <option value="">— pick a page —</option>
              {hoodOptions.map((p) => (
                <option key={p.hoodSlug} value={p.hoodSlug}>
                  {p.hoodName}
                  {p.isNewBuild ? " · NEW BUILD" : ""}
                  {p.hasCustomContent ? " · has custom content" : " · generated fallback"}
                  {draftFor(p.citySlug, p.hoodSlug) ? ` · ${draftFor(p.citySlug, p.hoodSlug)!.lifecycle.toUpperCase()}` : ""}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ---- editor ---- */}
        {form && page && (
          <section style={{ border: `2px solid ${INK}`, background: CARD, padding: 20, marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, letterSpacing: "0.08em" }}>
              {page.hoodName.toUpperCase()} · /city/{citySlug}/{hoodSlug} · {form.lifecycle.toUpperCase()}{form.readyForExport ? " ✓" : ""}
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#5a5348" }}>
              {page.hasCustomContent ? "This page has custom hood-content — exporting UPDATES its key." : "This page renders generated fallback copy — exporting ADDS its key."}
            </p>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={label}>SEO title (optional — formula fallback if empty)</span>
                  {counter(form.seoTitle, 25, 60)}
                </div>
                <input style={input} value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={label}>SEO meta description (optional)</span>
                  {counter(form.seoDescription, 70, 160)}
                </div>
                <textarea style={{ ...area, minHeight: 56 }} value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} />
              </div>
              <div>
                <div style={label}>Tagline</div>
                <input style={input} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </div>
              <div>
                <div style={label}>Intro / overview (blank line = new paragraph; min 2 paragraphs, 300 chars)</div>
                <textarea style={{ ...area, minHeight: 140 }} value={form.introText} onChange={(e) => setForm({ ...form, introText: e.target.value })} />
              </div>
              <div>
                <div style={label}>Homes & real estate copy</div>
                <textarea style={area} value={form.homesCopy} onChange={(e) => setForm({ ...form, homesCopy: e.target.value })} />
              </div>

              <div>
                <div style={label}>Highlights (lifestyle / location / context)</div>
                {form.highlights.map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <input style={{ ...input, maxWidth: 220 }} placeholder="Title" value={h.title} onChange={(e) => setForm({ ...form, highlights: form.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <input style={input} placeholder="Note" value={h.note} onChange={(e) => setForm({ ...form, highlights: form.highlights.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
                    <button style={btnGhost} onClick={() => setForm({ ...form, highlights: form.highlights.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => setForm({ ...form, highlights: [...form.highlights, { title: "", note: "" }] })}>
                  + HIGHLIGHT
                </button>
              </div>

              <div>
                <div style={label}>FAQ (min 2 — renders as FAQPage structured data)</div>
                {form.faq.map((f, i) => (
                  <div key={i} style={{ marginTop: 6, border: `1px solid ${INK}`, padding: 8 }}>
                    <input style={input} placeholder="Question" value={f.q} onChange={(e) => setForm({ ...form, faq: form.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                    <textarea style={{ ...area, minHeight: 56, marginTop: 6 }} placeholder="Answer (min 40 chars)" value={f.a} onChange={(e) => setForm({ ...form, faq: form.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                    <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => setForm({ ...form, faq: form.faq.filter((_, j) => j !== i) })}>REMOVE</button>
                  </div>
                ))}
                <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => setForm({ ...form, faq: [...form.faq, { q: "", a: "" }] })}>
                  + FAQ
                </button>
              </div>

              {page.isNewBuild && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={label}>New-build amenities (one per line)</div>
                  <textarea style={{ ...area, minHeight: 70 }} value={form.amenitiesText} onChange={(e) => setForm({ ...form, amenitiesText: e.target.value })} />
                  <div style={label}>Buyer notes (one per line — review-safe wording only)</div>
                  <textarea style={{ ...area, minHeight: 70 }} value={form.buyerNotesText} onChange={(e) => setForm({ ...form, buyerNotesText: e.target.value })} />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
              <button style={btnGhost} onClick={runLint} disabled={busy !== null}>{busy === "lint" ? "LINTING…" : "LINT (EXPORT STRICTNESS)"}</button>
              <button style={btnGhost} onClick={runHints} disabled={busy !== null}>{busy === "hints" ? "SCANNING…" : "MLS HINTS"}</button>
              <button style={btn} onClick={save} disabled={busy !== null}>{busy === "save" ? "SAVING…" : "SAVE DRAFT"}</button>
              {form.draftId && (form.lifecycle === "draft" || form.lifecycle === "ready") && (
                <>
                  <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={form.readyForExport} onChange={(e) => toggleReady(e.target.checked)} disabled={busy !== null} />
                    READY FOR EXPORT (server re-lints; does not publish)
                  </label>
                  <button style={{ ...btnGhost, borderColor: ORANGE, color: ORANGE, marginLeft: "auto" }} onClick={() => setArchiveNotes("")} disabled={busy !== null}>
                    ARCHIVE
                  </button>
                </>
              )}
            </div>

            {archiveNotes !== null && (
              <div style={{ border: `2px solid ${ORANGE}`, padding: 12, marginTop: 12 }}>
                <input style={{ ...input, marginBottom: 8 }} placeholder="Reason (optional)" value={archiveNotes} onChange={(e) => setArchiveNotes(e.target.value)} />
                <button style={{ ...btn, background: ORANGE, borderColor: ORANGE }} onClick={archive} disabled={busy !== null}>CONFIRM ARCHIVE</button>
                <button style={{ ...btnGhost, marginLeft: 8 }} onClick={() => setArchiveNotes(null)} disabled={busy !== null}>CANCEL</button>
              </div>
            )}

            {/* ---- lint panel ---- */}
            {lint && (
              <div style={{ marginTop: 16, border: `1.5px dashed ${lint.errors.length ? ORANGE : INK}`, padding: 12, fontSize: 13 }}>
                <div style={{ ...label, marginBottom: 6 }}>
                  LINT — {lint.errors.length} ERROR(S), {lint.warnings.length} WARNING(S)
                </div>
                {lint.errors.map((e, i) => (
                  <p key={`e${i}`} style={{ margin: "2px 0", color: ORANGE }}>✕ [{e.field}] {e.message}</p>
                ))}
                {lint.warnings.map((w, i) => (
                  <p key={`w${i}`} style={{ margin: "2px 0" }}>△ [{w.field}] {w.message}</p>
                ))}
                {!lint.errors.length && <p style={{ margin: "2px 0" }}>✓ export-ready</p>}
              </div>
            )}

            {/* ---- MLS hints panel (display-only facts) ---- */}
            {hints && (
              <div style={{ marginTop: 12, border: `1.5px dashed ${INK}`, padding: 12, fontSize: 13 }}>
                <div style={{ ...label, marginBottom: 6 }}>
                  MLS HINTS — FACTS ONLY, NOT COPY · “{hints.query?.normalizedName}” · MLS-MATCHED ONLY{hints.truncated ? " · ⚠ PARTIAL SCAN" : ""}
                </div>
                <p style={{ margin: 0 }}>
                  {hints.matched
                    ? `${hints.activeCount} active · ${hints.pendingCount} pending · ~${hints.quickMoveInEst} quick move-in (estimate) · floor ${hints.floorPrice ? "$" + Math.round(hints.floorPrice / 1000) + "K" : "—"} (band ${hints.suggestedFromLabel ?? "—"}) · builders observed: ${hints.buildersObserved.join(", ") || "—"} (NOT a verified roster)`
                    : "No new-construction MLS matches for this name."}
                  {hints.homonyms.length > 0 && ` · ⚠ homonyms: ${hints.homonyms.map((h) => h.cityName).join(", ")}`}
                </p>
              </div>
            )}

            {/* ---- photo panel (existing pipeline only) ---- */}
            <div style={{ marginTop: 12, border: `1.5px dashed ${INK}`, padding: 12, fontSize: 13 }}>
              <div style={{ ...label, marginBottom: 6 }}>PHOTOS — EXISTING PIPELINE ONLY</div>
              <p style={{ margin: 0 }}>
                Hero/gallery photos flow through the <a href="/admin/photos" style={{ color: INK }}>Photo Desk</a> (source, upload, approve) against this page&apos;s photo slots — nothing attaches here. New-build pages currently render no photo slot by design (a separate future decision).
              </p>
            </div>
          </section>
        )}

        {/* ---- draft list ---- */}
        <section>
          <h2 style={{ fontSize: 15, letterSpacing: "0.08em", borderBottom: `1.5px solid ${INK}`, paddingBottom: 6 }}>
            CONTENT DRAFTS ({drafts.length})
          </h2>
          {drafts.length === 0 && <p style={{ fontSize: 13 }}>No content drafts yet. (If migration 0013 has not been applied, the list is empty by design.)</p>}
          {drafts.map((d) => (
            <article
              key={d.id}
              onClick={() => (d.lifecycle === "draft" || d.lifecycle === "ready" ? openPage(d.citySlug, d.hoodSlug) : undefined)}
              style={{ border: `1.5px solid ${INK}`, background: CARD, padding: "12px 16px", marginTop: 10, cursor: d.lifecycle === "draft" || d.lifecycle === "ready" ? "pointer" : "default", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
            >
              <div>
                <strong>/city/{d.citySlug}/{d.hoodSlug}</strong>
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  {[d.seoTitle && "SEO title", d.intro.length && `${d.intro.length}¶ intro`, d.faq.length && `${d.faq.length} FAQ`, d.newBuild && "nb block"].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, alignSelf: "center" }}>
                {d.lifecycle.toUpperCase()}{d.readyForExport ? " ✓" : ""}
              </div>
            </article>
          ))}
        </section>

        <footer style={{ marginTop: 28, fontSize: 11, letterSpacing: "0.04em", color: "#5a5348" }}>
          CB-3a · CONTENT NEVER PUBLISHES FROM HERE — THE EXPORTER (--content) WRITES hood-content.json ON A REVIEWED BRANCH ·
          GENERATED FALLBACK COPY REMAINS FOR EVERY PAGE WITHOUT A KEY · LINKS RENDERING (CB-3b) AND CLAUDE ASSIST ARE SEPARATE
          FUTURE GATES
        </footer>
      </div>
    </main>
  );
}
