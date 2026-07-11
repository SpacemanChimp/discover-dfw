"use client";

/* CI-6 Photo Desk client. One candidate, one action, one request — no
   multi-select, no bulk anything. Approve requires alt text (per-photo
   friction by design) and shows the attribution that will publish.
   Candidates from sources whose publish obligations aren't implemented
   (pexels/unsplash) render with APPROVE disabled. Thumbnails load from
   provider CDNs in THIS browser only — the server never calls providers. */

import { useMemo, useState } from "react";
import type { ReviewSlot, ReviewCandidate } from "@/lib/content/admin-photos";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const REJECT_REASONS = ["wrong_place", "orbital", "document", "quality", "license_doubt", "other"];

type ActionResult = { ok: boolean; error?: string; revalidated?: boolean; consistent?: boolean; paths?: string[] };

export default function PhotoReviewQueue({ adminEmail, slots: initial }: { adminEmail: string; slots: ReviewSlot[] }) {
  const [slots, setSlots] = useState(initial);
  const [typeFilter, setTypeFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "approve"; slot: ReviewSlot; candidate: ReviewCandidate; altText: string; caption: string; attributionText: string }
    | { kind: "reject"; slot: ReviewSlot; candidate: ReviewCandidate; reason: string; detail: string }
    | { kind: "unpublish"; slot: ReviewSlot; notes: string }
    | { kind: "upload"; slot: ReviewSlot; file: File | null; attributionText: string; caption: string; rightsConfirmed: boolean }
    | null
  >(null);

  const visible = useMemo(
    () =>
      slots.filter(
        (s) =>
          (typeFilter === "all" || s.entityType === typeFilter) &&
          (!flaggedOnly || s.candidates.some((c) => c.flags.length > 0)) &&
          (showEmpty || s.candidates.length > 0 || s.asset)
      ),
    [slots, typeFilter, flaggedOnly, showEmpty]
  );
  const pendingTotal = useMemo(() => slots.reduce((n, s) => n + s.candidates.length, 0), [slots]);

  async function post(payload: Record<string, unknown>, busyKey: string): Promise<ActionResult> {
    setBusy(busyKey);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return (await res.json()) as ActionResult;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      setBusy(null);
    }
  }

  const removeCandidate = (slotId: string, candidateId: string, slotPatch?: Partial<ReviewSlot>) =>
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, ...slotPatch, candidates: s.candidates.filter((c) => c.id !== candidateId) } : s
      )
    );

  async function submitApprove() {
    if (!dialog || dialog.kind !== "approve") return;
    const { slot, candidate, altText, caption, attributionText } = dialog;
    const r = await post(
      { action: "approve", candidateId: candidate.id, altText, caption, attributionText },
      candidate.id
    );
    if (!r.ok) {
      setBanner(`APPROVE FAILED — ${r.error}`);
      return;
    }
    removeCandidate(slot.id, candidate.id, {
      status: "approved",
      asset: {
        id: "new",
        publicImageUrl: candidate.imageUrl,
        altText,
        attributionText,
        license: candidate.license ?? "",
        approvedBy: adminEmail,
        approvedAt: new Date().toISOString(),
      },
    });
    setBanner(
      r.revalidated
        ? `PUBLISHED ${slot.entitySlug}/${slot.slotKey} — revalidated ${r.paths?.join(", ")}${r.consistent ? "" : " ⚠ CONSISTENCY CHECK FAILED — investigate"}`
        : `APPROVED ${slot.entitySlug}/${slot.slotKey} — ⚠ REVALIDATION FAILED (${r.error}); no publish event written. Use REVALIDATE to retry.`
    );
    setDialog(null);
  }

  async function submitReject() {
    if (!dialog || dialog.kind !== "reject") return;
    const { slot, candidate, reason, detail } = dialog;
    const fullReason = detail ? `${reason}: ${detail}` : reason;
    const r = await post({ action: "reject", candidateId: candidate.id, reason: fullReason }, candidate.id);
    if (!r.ok) {
      setBanner(`REJECT FAILED — ${r.error}`);
      return;
    }
    removeCandidate(slot.id, candidate.id);
    setDialog(null);
  }

  async function submitUnpublish() {
    if (!dialog || dialog.kind !== "unpublish") return;
    const { slot, notes } = dialog;
    const r = await post({ action: "unpublish", slotId: slot.id, notes }, slot.id);
    if (!r.ok) {
      setBanner(`UNPUBLISH FAILED — ${r.error}`);
      return;
    }
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: "candidates_found", asset: null } : s)));
    setBanner(
      r.revalidated
        ? `UNPUBLISHED ${slot.entitySlug}/${slot.slotKey} — placeholder restored (${r.paths?.join(", ")})`
        : `UNPUBLISHED ${slot.entitySlug}/${slot.slotKey} — ⚠ revalidation failed (${r.error}); use REVALIDATE.`
    );
    setDialog(null);
  }

  async function submitUpload() {
    if (!dialog || dialog.kind !== "upload" || !dialog.file) return;
    const { slot, file, attributionText, caption, rightsConfirmed } = dialog;
    setBusy(slot.id);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("slotId", slot.id);
      fd.set("attributionText", attributionText);
      fd.set("caption", caption);
      fd.set("rightsConfirmed", String(rightsConfirmed));
      const res = await fetch("/api/admin/photos/upload", { method: "POST", body: fd });
      const r = (await res.json()) as ActionResult & { candidateId?: string; imageUrl?: string; width?: number; height?: number };
      if (!r.ok) {
        setBanner(`UPLOAD FAILED — ${r.error}`);
        return;
      }
      const newCandidate: ReviewCandidate = {
        id: r.candidateId!,
        source: "manual_upload",
        approvable: true,
        status: "pending",
        imageUrl: r.imageUrl!,
        thumbnailUrl: r.imageUrl!,
        sourcePageUrl: null,
        photographer: adminEmail,
        attributionText,
        license: "Owned — Discover DFW",
        width: r.width ?? null,
        height: r.height ?? null,
        confidenceScore: null,
        claudeNotes: null,
        flags: [],
        rejectedReason: null,
      };
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, candidates: [newCandidate, ...s.candidates] } : s)));
      setBanner(`UPLOADED to ${slot.entitySlug}/${slot.slotKey} as a PENDING candidate — publish via APPROVE when ready.`);
      setDialog(null);
    } finally {
      setBusy(null);
    }
  }

  async function research(slot: ReviewSlot, candidate: ReviewCandidate) {
    const r = await post({ action: "needs_research", candidateId: candidate.id }, candidate.id);
    if (!r.ok) {
      setBanner(`ACTION FAILED — ${r.error}`);
      return;
    }
    removeCandidate(slot.id, candidate.id);
  }

  const mono: React.CSSProperties = { fontSize: 10, letterSpacing: ".16em", fontWeight: 700 };
  const chip = (bg: string, fg: string): React.CSSProperties => ({
    ...mono,
    background: bg,
    color: fg,
    padding: "3px 8px",
    borderRadius: 6,
    display: "inline-block",
  });
  const btn = (danger = false): React.CSSProperties => ({
    ...mono,
    padding: "7px 12px",
    borderRadius: 8,
    border: `2px solid ${INK}`,
    background: danger ? CREAM : INK,
    color: danger ? INK : CREAM,
    cursor: "pointer",
  });

  return (
    <main className="font-mono" style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "38px 4vw 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ ...mono, color: ORANGE, marginBottom: 10 }}>INTERNAL — THE PHOTO DESK</div>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 800, fontSize: "clamp(28px,3.4vw,44px)" }}>
          Editorial photo review.
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.8, margin: "10px 0 4px", maxWidth: 760 }}>
          {pendingTotal} pending candidate(s) across {slots.filter((s) => s.candidates.length > 0).length} slot(s). Signed in
          as {adminEmail}. Approving publishes ONE photo to its live page — attribution and license travel with it. Nothing
          here is bulk; nothing is automatic.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "18px 0 26px", flexWrap: "wrap" }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ ...mono, padding: "7px 10px", border: `2px solid ${INK}`, borderRadius: 8, background: CARD }}
          >
            <option value="all">ALL TYPES</option>
            <option value="city">CITY GALLERIES</option>
            <option value="neighborhood">HOOD HEROES</option>
            <option value="homepage">HOMEPAGE PICKS</option>
          </select>
          <label style={{ ...mono, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            FLAGGED ONLY
          </label>
          <label style={{ ...mono, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            SHOW EMPTY SLOTS (UPLOAD TARGETS)
          </label>
        </div>

        {banner && (
          <div
            style={{
              ...mono,
              background: banner.includes("⚠") || banner.includes("FAILED") ? "#F5D0B2" : INK,
              color: banner.includes("⚠") || banner.includes("FAILED") ? INK : CREAM,
              border: `2px solid ${INK}`,
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 20,
              lineHeight: 1.7,
            }}
          >
            {banner}
          </div>
        )}

        {visible.length === 0 && <div style={{ ...mono, opacity: 0.6 }}>QUEUE EMPTY FOR THIS FILTER.</div>}

        {visible.map((slot) => (
          <section
            key={slot.id}
            style={{ border: `2px solid ${INK}`, borderRadius: 14, background: CARD, padding: 18, marginBottom: 18 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <span style={chip(INK, CREAM)}>{slot.entityType.toUpperCase()}</span>{" "}
                <span style={{ ...mono, fontSize: 12 }}>
                  {slot.entitySlug} · {slot.slotKey} — “{slot.label}”
                </span>
              </div>
              {slot.asset ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={chip(ORANGE, CREAM)}>LIVE — {slot.asset.license}</span>
                  <button
                    style={btn(true)}
                    disabled={busy !== null}
                    onClick={() => setDialog({ kind: "unpublish", slot, notes: "" })}
                  >
                    UNPUBLISH
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={chip("#E8DEC9", INK)}>{slot.candidates.length} CANDIDATE(S)</span>
                  <button
                    style={btn(true)}
                    disabled={busy !== null}
                    onClick={() =>
                      setDialog({ kind: "upload", slot, file: null, attributionText: "PHOTO: DISCOVER DFW", caption: "", rightsConfirmed: false })
                    }
                  >
                    UPLOAD…
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
              {slot.candidates.map((c) => (
                <div key={c.id} style={{ border: `1.5px solid ${INK}`, borderRadius: 10, overflow: "hidden", background: CREAM }}>
                  <div style={{ aspectRatio: "4 / 3", background: "#E8DEC9", position: "relative" }}>
                    {/* reviewer-browser display only — the server never fetches these */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.thumbnailUrl || c.imageUrl}
                      alt={c.attributionText ?? c.source}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {c.confidenceScore != null && (
                      <span style={{ ...chip(INK, CREAM), position: "absolute", top: 8, left: 8 }}>{c.confidenceScore}</span>
                    )}
                  </div>
                  <div style={{ padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={chip("#E8DEC9", INK)}>{c.source.toUpperCase()}</span>
                      <span style={chip("#E8DEC9", INK)}>{c.license ?? "NO LICENSE"}</span>
                      {c.width && c.height && <span style={chip("#E8DEC9", INK)}>{c.width}×{c.height}</span>}
                      {c.flags.map((f) => (
                        <span key={f} style={chip(ORANGE, CREAM)}>
                          {f.toUpperCase()}
                        </span>
                      ))}
                      {!c.approvable && <span style={chip("#F5D0B2", INK)}>SOURCE NOT APPROVABLE (V1)</span>}
                      {c.status === "needs_research" && <span style={chip("#F5D0B2", INK)}>NEEDS RESEARCH</span>}
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>{c.attributionText}</div>
                    {c.claudeNotes && <div style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.75 }}>{c.claudeNotes}</div>}
                    {c.sourcePageUrl && (
                      <a
                        href={c.sourcePageUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        style={{ ...mono, color: ORANGE, textDecoration: "none" }}
                      >
                        VIEW SOURCE / LICENSE →
                      </a>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      <button
                        style={{ ...btn(), opacity: c.approvable && !slot.asset ? 1 : 0.35 }}
                        disabled={!c.approvable || Boolean(slot.asset) || busy !== null}
                        title={
                          !c.approvable
                            ? "This source's publish obligations aren't implemented yet"
                            : slot.asset
                              ? "Slot already has a live asset — unpublish first"
                              : "Approve and publish this photo"
                        }
                        onClick={() =>
                          setDialog({
                            kind: "approve",
                            slot,
                            candidate: c,
                            altText: slot.label,
                            caption: "",
                            attributionText: c.attributionText ?? "",
                          })
                        }
                      >
                        APPROVE…
                      </button>
                      <button
                        style={btn(true)}
                        disabled={busy !== null}
                        onClick={() => setDialog({ kind: "reject", slot, candidate: c, reason: REJECT_REASONS[0], detail: "" })}
                      >
                        REJECT…
                      </button>
                      {c.status === "pending" && (
                        <button style={btn(true)} disabled={busy !== null} onClick={() => research(slot, c)}>
                          RESEARCH
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {dialog && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(29,25,19,.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 50,
            }}
            onClick={() => busy === null && setDialog(null)}
          >
            <div
              style={{ background: CARD, border: `2px solid ${INK}`, borderRadius: 14, padding: 22, maxWidth: 560, width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              {dialog.kind === "approve" && (
                <>
                  <div style={{ ...mono, color: ORANGE, marginBottom: 10 }}>
                    APPROVE &amp; PUBLISH — {dialog.slot.entitySlug}/{dialog.slot.slotKey}
                  </div>
                  <label style={{ ...mono, display: "block", marginBottom: 4 }}>ALT TEXT (REQUIRED)</label>
                  <input
                    value={dialog.altText}
                    onChange={(e) => setDialog({ ...dialog, altText: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 10, fontSize: 13 }}
                  />
                  <label style={{ ...mono, display: "block", marginBottom: 4 }}>CAPTION (OPTIONAL)</label>
                  <input
                    value={dialog.caption}
                    onChange={(e) => setDialog({ ...dialog, caption: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 10, fontSize: 13 }}
                  />
                  <label style={{ ...mono, display: "block", marginBottom: 4 }}>ATTRIBUTION (PUBLISHES WITH THE PHOTO)</label>
                  <input
                    value={dialog.attributionText}
                    onChange={(e) => setDialog({ ...dialog, attributionText: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 14, fontSize: 13 }}
                  />
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button style={btn(true)} disabled={busy !== null} onClick={() => setDialog(null)}>
                      CANCEL
                    </button>
                    <button
                      style={{ ...btn(), opacity: dialog.altText.trim() && dialog.attributionText.trim() ? 1 : 0.4 }}
                      disabled={!dialog.altText.trim() || !dialog.attributionText.trim() || busy !== null}
                      onClick={submitApprove}
                    >
                      {busy ? "PUBLISHING…" : "CONFIRM — PUBLISH LIVE"}
                    </button>
                  </div>
                </>
              )}
              {dialog.kind === "reject" && (
                <>
                  <div style={{ ...mono, color: ORANGE, marginBottom: 10 }}>REJECT CANDIDATE</div>
                  <select
                    value={dialog.reason}
                    onChange={(e) => setDialog({ ...dialog, reason: e.target.value })}
                    style={{ ...mono, width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 10, background: CREAM }}
                  >
                    {REJECT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="detail (optional)"
                    value={dialog.detail}
                    onChange={(e) => setDialog({ ...dialog, detail: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 14, fontSize: 13 }}
                  />
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button style={btn(true)} disabled={busy !== null} onClick={() => setDialog(null)}>
                      CANCEL
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={submitReject}>
                      {busy ? "…" : "CONFIRM REJECT"}
                    </button>
                  </div>
                </>
              )}
              {dialog.kind === "upload" && (
                <>
                  <div style={{ ...mono, color: ORANGE, marginBottom: 10 }}>
                    UPLOAD PHOTO — {dialog.slot.entitySlug}/{dialog.slot.slotKey} · “{dialog.slot.label}”
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 0 }}>
                    JPEG/PNG/WebP · max 4 MB · min 1200px wide · landscape. The file is re-encoded web-ready (EXIF/GPS
                    stripped) and becomes a PENDING candidate — publishing stays a separate APPROVE step.
                  </p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setDialog({ ...dialog, file: e.target.files?.[0] ?? null })}
                    style={{ ...mono, display: "block", marginBottom: 10 }}
                  />
                  <label style={{ ...mono, display: "block", marginBottom: 4 }}>ATTRIBUTION (REQUIRED)</label>
                  <input
                    value={dialog.attributionText}
                    onChange={(e) => setDialog({ ...dialog, attributionText: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 10, fontSize: 13 }}
                  />
                  <label style={{ ...mono, display: "block", marginBottom: 4 }}>CAPTION (OPTIONAL)</label>
                  <input
                    value={dialog.caption}
                    onChange={(e) => setDialog({ ...dialog, caption: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 10, fontSize: 13 }}
                  />
                  <label style={{ ...mono, display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, cursor: "pointer", lineHeight: 1.6 }}>
                    <input
                      type="checkbox"
                      checked={dialog.rightsConfirmed}
                      onChange={(e) => setDialog({ ...dialog, rightsConfirmed: e.target.checked })}
                      style={{ marginTop: 2 }}
                    />
                    I HAVE THE RIGHT TO USE THIS PHOTO ON DISCOVERDFW.COM
                  </label>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button style={btn(true)} disabled={busy !== null} onClick={() => setDialog(null)}>
                      CANCEL
                    </button>
                    <button
                      style={{ ...btn(), opacity: dialog.file && dialog.attributionText.trim() && dialog.rightsConfirmed ? 1 : 0.4 }}
                      disabled={!dialog.file || !dialog.attributionText.trim() || !dialog.rightsConfirmed || busy !== null}
                      onClick={submitUpload}
                    >
                      {busy ? "UPLOADING…" : "UPLOAD AS PENDING CANDIDATE"}
                    </button>
                  </div>
                </>
              )}
              {dialog.kind === "unpublish" && (
                <>
                  <div style={{ ...mono, color: ORANGE, marginBottom: 10 }}>
                    UNPUBLISH — {dialog.slot.entitySlug}/{dialog.slot.slotKey}
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                    Removes the live photo (placeholder returns after revalidation). The candidate returns to pending; the
                    audit trail is kept.
                  </p>
                  <input
                    placeholder="notes (optional)"
                    value={dialog.notes}
                    onChange={(e) => setDialog({ ...dialog, notes: e.target.value })}
                    style={{ width: "100%", padding: 8, border: `2px solid ${INK}`, borderRadius: 8, marginBottom: 14, fontSize: 13 }}
                  />
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button style={btn(true)} disabled={busy !== null} onClick={() => setDialog(null)}>
                      CANCEL
                    </button>
                    <button style={btn()} disabled={busy !== null} onClick={submitUnpublish}>
                      {busy ? "…" : "CONFIRM UNPUBLISH"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
