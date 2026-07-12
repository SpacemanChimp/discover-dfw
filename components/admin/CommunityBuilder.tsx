"use client";

/* CB-1 Community Builder client. One draft, one action, one request — no
   bulk anything, mirroring the Photo Desk idiom. The LOOK UP panel is
   read-only MLS intelligence (our replicated store); suggestions are
   applied only by explicit click, never auto-filled. Saving creates or
   updates a DRAFT — nothing here publishes a page. */

import { useMemo, useState } from "react";
import type { CommunityDraft, DraftType } from "@/lib/content/community-drafts";
import type { CommunityLookup } from "@/lib/content/mls-community-lookup";
import { slugifyHood } from "@/lib/slug";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const STATUS_OPTIONS = ["NOW SELLING", "MODELS OPEN", "FINAL PHASE", "SOLD OUT"];

type FormState = {
  draftId: string | null; // null = creating
  type: DraftType;
  name: string;
  citySlug: string;
  slug: string;         // "" = derive from name
  statusLabel: string;
  fromLabel: string;
  buildersCount: string; // text input; validated server-side
  buildersLabel: string;
  note: string;
  readyForExport: boolean;
  lifecycle: string;
};

const EMPTY: FormState = {
  draftId: null,
  type: "new_build",
  name: "",
  citySlug: "",
  slug: "",
  statusLabel: "NOW SELLING",
  fromLabel: "",
  buildersCount: "",
  buildersLabel: "",
  note: "",
  readyForExport: false,
  lifecycle: "draft",
};

const label: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: INK, textTransform: "uppercase" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1.5px solid ${INK}`, background: "#fff", color: INK, fontSize: 14, borderRadius: 2 };
const btn: React.CSSProperties = { padding: "8px 14px", border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 12, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer", borderRadius: 2, textTransform: "uppercase" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: INK };

export default function CommunityBuilder({
  adminEmail,
  drafts: initial,
  cities,
}: {
  adminEmail: string;
  drafts: CommunityDraft[];
  cities: { slug: string; name: string }[];
}) {
  const [drafts, setDrafts] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [lookup, setLookup] = useState<CommunityLookup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [archiveFor, setArchiveFor] = useState<{ draft: CommunityDraft; notes: string } | null>(null);

  const cityName = useMemo(() => new Map(cities.map((c) => [c.slug, c.name])), [cities]);
  const effectiveSlug = form ? form.slug.trim() || slugifyHood(form.name) : "";

  async function post(path: string, payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setBanner(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return (await res.json()) as { ok: boolean; error?: string; draftId?: string; auditError?: string | null; lookup?: CommunityLookup };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      setBusy(null);
    }
  }

  function openNew() {
    setLookup(null);
    setForm({ ...EMPTY, citySlug: cities[0]?.slug ?? "" });
  }

  function openEdit(d: CommunityDraft) {
    setLookup((d.mlsSnapshot as CommunityLookup | null) ?? null);
    setForm({
      draftId: d.id,
      type: d.type,
      name: d.name,
      citySlug: d.citySlug,
      slug: d.slug,
      statusLabel: d.statusLabel ?? "NOW SELLING",
      fromLabel: d.fromLabel ?? "",
      buildersCount: d.buildersCount == null ? "" : String(d.buildersCount),
      buildersLabel: d.buildersLabel ?? "",
      note: d.note ?? "",
      readyForExport: d.readyForExport,
      lifecycle: d.lifecycle,
    });
  }

  async function runLookup() {
    if (!form) return;
    const r = await post("/api/admin/communities/lookup", { name: form.name, citySlug: form.citySlug }, "lookup");
    if (!r.ok || !r.lookup) {
      setBanner(`LOOKUP FAILED — ${r.error}`);
      return;
    }
    setLookup(r.lookup);
  }

  async function save() {
    if (!form) return;
    const fields = {
      type: form.type,
      name: form.name,
      citySlug: form.citySlug,
      slug: effectiveSlug,
      statusLabel: form.type === "new_build" ? form.statusLabel : "",
      fromLabel: form.fromLabel,
      buildersCount: form.buildersCount.trim() === "" ? null : form.buildersCount.trim(),
      buildersLabel: form.buildersLabel,
      note: form.note,
      mlsSnapshot: lookup ?? undefined,
    };
    const r = form.draftId
      ? await post("/api/admin/communities", { action: "update", draftId: form.draftId, ...fields, readyForExport: form.readyForExport }, "save")
      : await post("/api/admin/communities", { action: "create", ...fields }, "save");
    if (!r.ok) {
      setBanner(`SAVE FAILED — ${r.error}`);
      return;
    }
    const now = new Date().toISOString();
    const saved: CommunityDraft = {
      id: form.draftId ?? r.draftId ?? "new",
      type: form.type,
      name: form.name.trim(),
      citySlug: form.citySlug,
      slug: effectiveSlug,
      statusLabel: form.type === "new_build" ? (form.statusLabel as CommunityDraft["statusLabel"]) : null,
      fromLabel: form.fromLabel.trim() || null,
      buildersCount: form.buildersCount.trim() === "" ? null : Number(form.buildersCount),
      buildersLabel: form.buildersLabel.trim() || null,
      note: form.note.trim() || null,
      readyForExport: form.readyForExport,
      lifecycle: form.readyForExport ? "ready" : "draft",
      mlsSnapshot: (lookup as unknown as Record<string, unknown>) ?? null,
      createdBy: adminEmail,
      createdAt: now,
      updatedAt: now,
    };
    setDrafts((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
    setBanner(
      `SAVED ${saved.citySlug}/${saved.slug} — ${saved.lifecycle.toUpperCase()}${r.auditError ? ` ⚠ AUDIT ROW FAILED (${r.auditError})` : ""}. Drafts do not publish; the exporter is a separate gate.`
    );
    setForm(null);
  }

  async function submitArchive() {
    if (!archiveFor) return;
    const r = await post("/api/admin/communities", { action: "archive", draftId: archiveFor.draft.id, notes: archiveFor.notes }, archiveFor.draft.id);
    if (!r.ok) {
      setBanner(`ARCHIVE FAILED — ${r.error}`);
      return;
    }
    setDrafts((prev) => prev.filter((d) => d.id !== archiveFor.draft.id));
    setArchiveFor(null);
    setForm(null);
  }

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>COMMUNITY BUILDER</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
              DRAFTS ONLY — PUBLISHING IS THE SEPARATELY-GATED EXPORTER · SIGNED IN AS {adminEmail.toUpperCase()}
            </p>
          </div>
          <button style={btn} onClick={openNew} disabled={busy !== null}>
            + NEW DRAFT
          </button>
        </header>

        {banner && (
          <div style={{ border: `2px solid ${banner.includes("FAILED") ? ORANGE : INK}`, background: CARD, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {banner}
          </div>
        )}

        {/* ---- form ---- */}
        {form && (
          <section style={{ border: `2px solid ${INK}`, background: CARD, padding: 20, marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, letterSpacing: "0.08em" }}>
              {form.draftId ? "EDIT DRAFT" : "NEW DRAFT"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div>
                <div style={label}>Type</div>
                <select style={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DraftType })} disabled={!!form.draftId}>
                  <option value="new_build">New-build community</option>
                  <option value="hood">Regular hood</option>
                </select>
              </div>
              <div>
                <div style={label}>Name</div>
                <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. LakeHaven" />
              </div>
              <div>
                <div style={label}>City</div>
                <select style={input} value={form.citySlug} onChange={(e) => setForm({ ...form, citySlug: e.target.value })}>
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={label}>Slug (page URL)</div>
                <input style={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={slugifyHood(form.name) || "auto"} />
                <div style={{ fontSize: 11, marginTop: 4, color: "#5a5348" }}>
                  /city/{form.citySlug || "…"}/{effectiveSlug || "…"}
                </div>
              </div>
              {form.type === "new_build" && (
                <div>
                  <div style={label}>Status</div>
                  <select style={input} value={form.statusLabel} onChange={(e) => setForm({ ...form, statusLabel: e.target.value })}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div style={label}>From (price band)</div>
                <input style={input} value={form.fromLabel} onChange={(e) => setForm({ ...form, fromLabel: e.target.value })} placeholder='e.g. "$230s"' />
              </div>
              <div>
                <div style={label}>Builders count</div>
                <input style={input} value={form.buildersCount} onChange={(e) => setForm({ ...form, buildersCount: e.target.value })} placeholder="MLS-observed, not a roster" />
              </div>
              <div>
                <div style={label}>Builders label (optional)</div>
                <input style={input} value={form.buildersLabel} onChange={(e) => setForm({ ...form, buildersLabel: e.target.value })} placeholder='e.g. "SEVERAL BUILDERS"' />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={label}>Note (short editorial — no unverified claims)</div>
              <textarea style={{ ...input, minHeight: 60 }} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
              <button style={btnGhost} onClick={runLookup} disabled={busy !== null || !form.name.trim()}>
                {busy === "lookup" ? "SCANNING…" : "LOOK UP MLS DATA"}
              </button>
              <button style={btn} onClick={save} disabled={busy !== null || !form.name.trim() || !form.citySlug}>
                {busy === "save" ? "SAVING…" : form.draftId ? "SAVE CHANGES" : "CREATE DRAFT"}
              </button>
              {form.draftId && (form.lifecycle === "draft" || form.lifecycle === "ready") && (
                <>
                  <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={form.readyForExport} onChange={(e) => setForm({ ...form, readyForExport: e.target.checked })} />
                    READY FOR EXPORT (does not publish)
                  </label>
                  <button
                    style={{ ...btnGhost, borderColor: ORANGE, color: ORANGE, marginLeft: "auto" }}
                    onClick={() => setArchiveFor({ draft: drafts.find((d) => d.id === form.draftId)!, notes: "" })}
                    disabled={busy !== null}
                  >
                    ARCHIVE
                  </button>
                </>
              )}
              <button style={btnGhost} onClick={() => setForm(null)} disabled={busy !== null}>
                CANCEL
              </button>
            </div>

            {/* ---- lookup results ---- */}
            {lookup && (
              <div style={{ marginTop: 18, border: `1.5px dashed ${INK}`, padding: 14, fontSize: 13 }}>
                <div style={{ ...label, marginBottom: 8 }}>
                  MLS SCAN — “{lookup.query.normalizedName}” · NEW CONSTRUCTION (BUILT ≥ {lookup.query.yearMin}) · MLS-MATCHED ONLY
                  {lookup.truncated ? " · ⚠ PARTIAL SCAN (row cap hit)" : ""}
                </div>
                {!lookup.matched ? (
                  <p style={{ margin: 0 }}>No new-construction listings matched this name in {cityName.get(lookup.query.citySlug) ?? lookup.query.citySlug}.</p>
                ) : (
                  <>
                    <p style={{ margin: "0 0 8px" }}>
                      <strong>{lookup.activeCount} active</strong> · {lookup.pendingCount} pending · ~{lookup.quickMoveInEst} quick move-in (estimate)
                      {lookup.floorPrice ? (
                        <>
                          {" "}· floor ${Math.round(lookup.floorPrice / 1000)}K →{" "}
                          <button
                            style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}
                            onClick={() => setForm((f) => (f ? { ...f, fromLabel: lookup.suggestedFromLabel ?? f.fromLabel } : f))}
                          >
                            APPLY “{lookup.suggestedFromLabel}”
                          </button>
                        </>
                      ) : null}
                      {lookup.suggestedBuildersCount != null && (
                        <>
                          {" "}· {lookup.suggestedBuildersCount} builders observed →{" "}
                          <button
                            style={{ ...btnGhost, padding: "2px 8px", fontSize: 11 }}
                            onClick={() => setForm((f) => (f ? { ...f, buildersCount: String(lookup.suggestedBuildersCount) } : f))}
                          >
                            APPLY
                          </button>
                        </>
                      )}
                    </p>
                    {lookup.buildersObserved.length > 0 && (
                      <p style={{ margin: "0 0 8px" }}>
                        <span style={label}>Builders (MLS-observed, NOT a verified roster): </span>
                        {lookup.buildersObserved.join(" · ")}
                      </p>
                    )}
                    {lookup.aliases.length > 0 && (
                      <p style={{ margin: "0 0 8px" }}>
                        <span style={label}>Subdivision aliases: </span>
                        {lookup.aliases.join(" · ")}
                      </p>
                    )}
                  </>
                )}
                {lookup.homonyms.length > 0 && (
                  <p style={{ margin: 0, color: ORANGE, fontWeight: 700 }}>
                    ⚠ HOMONYM WARNING — the same or a similar name also appears in:{" "}
                    {lookup.homonyms
                      .map((h) => `${h.cityName || "unknown city"} (${h.count}${h.variants.length ? `: ${h.variants.join(" / ")}` : ""})`)
                      .join(", ")}
                    . Verify these are not the same community before trusting counts.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ---- archive confirm ---- */}
        {archiveFor && (
          <section style={{ border: `2px solid ${ORANGE}`, background: CARD, padding: 16, marginBottom: 24 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              Archive <strong>{archiveFor.draft.citySlug}/{archiveFor.draft.slug}</strong>? The row is kept (audited), never deleted; the slug frees up for a redo.
            </p>
            <input style={{ ...input, marginBottom: 10 }} placeholder="Reason (optional)" value={archiveFor.notes} onChange={(e) => setArchiveFor({ ...archiveFor, notes: e.target.value })} />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...btn, background: ORANGE, borderColor: ORANGE }} onClick={submitArchive} disabled={busy !== null}>
                CONFIRM ARCHIVE
              </button>
              <button style={btnGhost} onClick={() => setArchiveFor(null)} disabled={busy !== null}>
                CANCEL
              </button>
            </div>
          </section>
        )}

        {/* ---- draft list ---- */}
        <section>
          <h2 style={{ fontSize: 15, letterSpacing: "0.08em", borderBottom: `1.5px solid ${INK}`, paddingBottom: 6 }}>
            DRAFTS ({drafts.length})
          </h2>
          {drafts.length === 0 && <p style={{ fontSize: 13 }}>No drafts yet. (If migration 0012 has not been applied, the list is empty by design.)</p>}
          {drafts.map((d) => (
            <article
              key={d.id}
              onClick={() => (d.lifecycle === "draft" || d.lifecycle === "ready" ? openEdit(d) : undefined)}
              style={{
                border: `1.5px solid ${INK}`,
                background: CARD,
                padding: "12px 16px",
                marginTop: 10,
                cursor: d.lifecycle === "draft" || d.lifecycle === "ready" ? "pointer" : "default",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{d.name}</strong>{" "}
                <span style={{ fontSize: 12 }}>
                  · {cityName.get(d.citySlug) ?? d.citySlug} · /city/{d.citySlug}/{d.slug} · {d.type === "new_build" ? "NEW BUILD" : "HOOD"}
                </span>
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  {[d.fromLabel, d.buildersCount != null ? `${d.buildersCount} builders` : d.buildersLabel, d.statusLabel].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, alignSelf: "center" }}>
                {d.lifecycle.toUpperCase()}
                {d.readyForExport ? " ✓" : ""}
              </div>
            </article>
          ))}
        </section>

        <footer style={{ marginTop: 28, fontSize: 11, letterSpacing: "0.04em", color: "#5a5348" }}>
          CB-1 · DRAFTS NEVER PUBLISH — THE EXPORTER (CB-2) WRITES dfw.data.json ON A REVIEWED BRANCH · COLLISIONS WITH EXISTING
          HOODS/NEW-BUILDS ARE BLOCKED (SAME-CITY SLUGS, CROSS-CITY NAMES, AND THE SIX DEFERRED CONVERSIONS) · PHOTO ATTACH
          ARRIVES IN A LATER GATE
        </footer>
      </div>
    </main>
  );
}
