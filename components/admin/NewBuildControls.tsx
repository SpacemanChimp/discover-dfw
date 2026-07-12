"use client";

/* New Build Controls client — one community, one action, one request.
   Flips require the typed phrase (PUBLISH <slug> / UNPUBLISH <slug>);
   caution states surface BEFORE the confirm box so an anomalous or
   stale community gets eyeballed first. The FIRST flip through this UI
   is its own supervised gate. */

import { useState } from "react";
import type { NbControlRow } from "@/lib/content/admin-newbuilds";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const btn: React.CSSProperties = { padding: "8px 14px", border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 12, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer", borderRadius: 2, textTransform: "uppercase" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: INK };
const input: React.CSSProperties = { padding: "8px 10px", border: `1.5px solid ${INK}`, background: "#fff", color: INK, fontSize: 13, borderRadius: 2 };

export default function NewBuildControls({ adminEmail, rows: initial }: { adminEmail: string; rows: NbControlRow[] }) {
  const [rows, setRows] = useState(initial);
  const [confirmFor, setConfirmFor] = useState<{ row: NbControlRow; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function flip() {
    if (!confirmFor) return;
    const { row, text } = confirmFor;
    const action = row.published ? "unpublish" : "publish";
    setBusy(row.id);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/newbuilds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, communityId: row.id, confirm: text }),
      });
      const r = (await res.json()) as { ok: boolean; error?: string; published?: boolean; revalidated?: boolean; paths?: string[]; auditError?: string | null };
      if (!r.ok) {
        setBanner(`${action.toUpperCase()} REFUSED — ${r.error}`);
        return;
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, published: r.published! } : x)));
      setBanner(
        `${row.slug} ${r.published ? "PUBLISHED" : "UNPUBLISHED"} — ${r.revalidated ? `revalidated ${r.paths?.join(", ")}` : "⚠ REVALIDATION FAILED — redeploy to refresh the static page"}${r.auditError ? ` ⚠ AUDIT ROW FAILED (${r.auditError})` : ""}`
      );
      setConfirmFor(null);
    } catch (e) {
      setBanner(`FAILED — ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>NEW BUILD CONTROLS</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
            INVENTORY-BAND PUBLISH SWITCHES · TYPED CONFIRMATION PER FLIP · SIGNED IN AS {adminEmail.toUpperCase()}
          </p>
        </header>

        {banner && (
          <div style={{ border: `2px solid ${banner.includes("REFUSED") || banner.includes("FAILED") ? ORANGE : INK}`, background: CARD, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {banner}
          </div>
        )}

        {rows.length === 0 && <p style={{ fontSize: 13 }}>No communities found (service key or NB-1 seed missing).</p>}

        {rows.map((r) => (
          <article key={r.id} style={{ border: `1.5px solid ${INK}`, background: CARD, padding: "12px 16px", marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{r.name}</strong>{" "}
                <span style={{ fontSize: 12 }}>· /{r.slug} · {r.status.toUpperCase()}</span>
                <div className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".08em", marginTop: 4, color: "rgba(29,25,19,.7)" }}>
                  {r.snapshot
                    ? `${r.snapshot.active} ACTIVE · ${r.snapshot.pending} PENDING · ~${r.snapshot.qmi} QMI EST · AS OF ${new Date(r.snapshot.calculatedAt).toISOString().slice(0, 10)}`
                    : "NO SNAPSHOT"}
                </div>
                {r.cautions.map((c, i) => (
                  <div key={i} className="font-mono" style={{ fontSize: 10, letterSpacing: ".06em", marginTop: 3, color: ORANGE, fontWeight: 700 }}>
                    ⚠ {c}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", padding: "5px 10px", borderRadius: 999, border: `1.5px solid ${r.published ? INK : "rgba(29,25,19,.4)"}`, background: r.published ? INK : "transparent", color: r.published ? CREAM : "rgba(29,25,19,.6)" }}>
                  {r.published ? "BAND LIVE" : "HIDDEN"}
                </span>
                <button
                  style={btnGhost}
                  onClick={() => setConfirmFor({ row: r, text: "" })}
                  disabled={busy !== null}
                >
                  {r.published ? "UNPUBLISH…" : "PUBLISH…"}
                </button>
              </div>
            </div>

            {confirmFor?.row.id === r.id && (
              <div style={{ border: `2px solid ${ORANGE}`, padding: 12, marginTop: 10 }}>
                <div className="font-mono" style={{ fontSize: 10.5, letterSpacing: ".1em", marginBottom: 8, color: ORANGE, fontWeight: 700 }}>
                  TYPE EXACTLY: {r.published ? "UNPUBLISH" : "PUBLISH"} {r.slug}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, minWidth: 280 }}
                    value={confirmFor.text}
                    onChange={(e) => setConfirmFor({ row: r, text: e.target.value })}
                    placeholder={`${r.published ? "UNPUBLISH" : "PUBLISH"} ${r.slug}`}
                  />
                  <button
                    style={{ ...btn, background: ORANGE, borderColor: ORANGE, opacity: confirmFor.text === `${r.published ? "UNPUBLISH" : "PUBLISH"} ${r.slug}` ? 1 : 0.5 }}
                    onClick={flip}
                    disabled={busy !== null || confirmFor.text !== `${r.published ? "UNPUBLISH" : "PUBLISH"} ${r.slug}`}
                  >
                    {busy === r.id ? "FLIPPING…" : "CONFIRM"}
                  </button>
                  <button style={btnGhost} onClick={() => setConfirmFor(null)} disabled={busy !== null}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}

        <footer className="font-mono" style={{ marginTop: 28, fontSize: 10, letterSpacing: ".06em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
          PUBLISH REFUSES WITHOUT A HOOD PAGE OR SNAPSHOT · UNDER-3-ACTIVE BANDS HIDE THEMSELVES EVEN WHEN PUBLISHED ·
          EVERY FLIP AUDITS TO verification_events AND REVALIDATES THE STATIC PAGES · FIRST FLIP THROUGH THIS UI = SUPERVISED GATE
        </footer>
      </div>
    </main>
  );
}
