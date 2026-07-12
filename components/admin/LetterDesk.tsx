"use client";

/* The Letter Desk (TL-2) — the Sunday issue builder. One issue, one
   action, one request. NOTHING auto-sends: GENERATE reads our own data,
   SAVE/READY are draft states, SEND TEST goes only to the signed-in
   admin, and SEND ISSUE demands the typed phrase SEND <date> and walks a
   per-recipient idempotent log. Until migration 0015 is applied every
   action surfaces the friendly 503. */

import { useMemo, useState } from "react";
import type { LetterIssue, IssueLint } from "@/lib/content/letter-issues";
import type { IssueSections, IssueStats } from "@/lib/email/letter-issue";
import type { PageOption } from "@/lib/content/community-content-drafts";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const label: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, color: INK, textTransform: "uppercase" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: `1.5px solid ${INK}`, background: "#fff", color: INK, fontSize: 14, borderRadius: 2 };
const area: React.CSSProperties = { ...input, minHeight: 120, fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "8px 14px", border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 12, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer", borderRadius: 2, textTransform: "uppercase" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: INK };

type Counts = { subscribed: number; pending: number; unsubscribed: number };

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
  const [issues, setIssues] = useState(initialIssues);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [cowCity, setCowCity] = useState("");
  const [cowHood, setCowHood] = useState("");
  const [cowBlurb, setCowBlurb] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [lint, setLint] = useState<IssueLint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const issue = useMemo(() => issues.find((i) => i.id === openId) ?? null, [issues, openId]);
  const cityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of pages) if (!seen.has(p.citySlug)) seen.set(p.citySlug, p.cityName);
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [pages]);
  const hoodOptions = useMemo(() => pages.filter((p) => p.citySlug === cowCity), [pages, cowCity]);

  async function post(payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return (await res.json()) as { ok: boolean; error?: string; issueId?: string; issueDate?: string; stats?: IssueStats; lint?: IssueLint; sent?: number; failed?: number; skippedAlreadySent?: number; to?: string; dryRun?: boolean; regenerated?: boolean };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    } finally {
      setBusy(null);
    }
  }

  function openIssue(i: LetterIssue) {
    setOpenId(i.id);
    setSubject(i.subject ?? "");
    setNote(i.sections?.editorsNote ?? "");
    setCowCity(i.sections?.communityOfWeek?.citySlug ?? "");
    setCowHood(i.sections?.communityOfWeek?.hoodSlug ?? "");
    setCowBlurb(i.sections?.communityOfWeek?.blurb ?? "");
    setConfirmText("");
    setLint(null);
  }

  const patchIssue = (id: string, patch: Partial<LetterIssue>) =>
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  function sectionsPayload(): IssueSections {
    return {
      editorsNote: note,
      communityOfWeek:
        cowCity && cowHood
          ? { citySlug: cowCity, hoodSlug: cowHood, name: pages.find((p) => p.citySlug === cowCity && p.hoodSlug === cowHood)?.hoodName ?? "", blurb: cowBlurb }
          : null,
    };
  }

  async function generate() {
    const r = await post({ action: "generate" }, "generate");
    if (!r.ok) return setBanner(`GENERATE FAILED — ${r.error}`);
    setBanner(`NUMBERS ${r.regenerated ? "REGENERATED" : "GENERATED"} FOR ${r.issueDate} — nothing sent, nothing scheduled.`);
    // pull fresh list state from the response
    const existing = issues.find((i) => i.id === r.issueId);
    if (existing) patchIssue(r.issueId!, { stats: r.stats ?? existing.stats, status: "draft" });
    else
      setIssues((prev) => [
        { id: r.issueId!, issueDate: r.issueDate!, subject: null, sections: { editorsNote: "", communityOfWeek: null }, stats: r.stats ?? null, status: "draft", sentAt: null, sentCount: 0, failedCount: 0, createdBy: adminEmail, updatedAt: new Date().toISOString() },
        ...prev,
      ]);
  }

  async function save() {
    if (!issue) return;
    const r = await post({ action: "save", issueId: issue.id, subject, sections: sectionsPayload() }, "save");
    if (!r.ok) return setBanner(`SAVE FAILED — ${r.error}`);
    if (r.lint) setLint(r.lint);
    patchIssue(issue.id, { subject, sections: sectionsPayload(), status: "draft" });
    setBanner("SAVED — DRAFT (edits drop readiness).");
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

  const chip: React.CSSProperties = { display: "inline-block", padding: "8px 14px", border: `2px solid ${INK}`, background: CARD, borderRadius: 2, marginRight: 8, marginBottom: 8 };

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK, padding: "32px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>THE LETTER — ISSUE BUILDER</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
              NO AUTO-SEND · TEST COPIES GO ONLY TO YOU · REAL SENDS NEED THE TYPED PHRASE · SIGNED IN AS {adminEmail.toUpperCase()}
            </p>
          </div>
          <button style={btn} onClick={generate} disabled={busy !== null}>
            {busy === "generate" ? "READING THE WEEK…" : "GENERATE SUNDAY DRAFT"}
          </button>
        </header>

        {banner && (
          <div style={{ border: `2px solid ${banner.includes("FAILED") || banner.includes("REFUSED") ? ORANGE : INK}`, background: CARD, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {banner}
          </div>
        )}

        <section style={{ marginBottom: 20 }}>
          <span style={chip}><strong style={{ fontSize: 20 }}>{counts.subscribed}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>SUBSCRIBED</span></span>
          <span style={chip}><strong style={{ fontSize: 20 }}>{counts.pending}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>PENDING</span></span>
          <span style={chip}><strong style={{ fontSize: 20 }}>{counts.unsubscribed}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>UNSUBSCRIBED</span></span>
        </section>

        {/* ---- editor ---- */}
        {issue && (
          <section style={{ border: `2px solid ${INK}`, background: CARD, padding: 20, marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, letterSpacing: "0.08em" }}>
              ISSUE {issue.issueDate} · {issue.status.toUpperCase()}
              {issue.status === "sent" ? ` — ${issue.sentCount} SENT / ${issue.failedCount} FAILED` : ""}
            </h2>
            {issue.stats && (
              <p className="font-mono" style={{ margin: "0 0 14px", fontSize: 10, letterSpacing: ".1em", color: "rgba(29,25,19,.6)" }}>
                NUMBERS AS OF {issue.stats.generatedAt}: {issue.stats.metro.actives.toLocaleString()} METRO ACTIVES · {issue.stats.metro.new7d.toLocaleString()} NEW (7D) · TOP MOVER {[...issue.stats.cities].sort((a, b) => b.new7d - a.new7d)[0]?.name ?? "—"}
              </p>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={label}>Subject</div>
                <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder='e.g. "The week North Texas blinked"' disabled={issue.status === "sent"} />
              </div>
              <div>
                <div style={label}>From the desk (editor&apos;s note — min 120 chars; risky-claims linted)</div>
                <textarea style={area} value={note} onChange={(e) => setNote(e.target.value)} disabled={issue.status === "sent"} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                <div>
                  <div style={label}>Community of the week — city</div>
                  <select style={input} value={cowCity} onChange={(e) => { setCowCity(e.target.value); setCowHood(""); }} disabled={issue.status === "sent"}>
                    <option value="">— none —</option>
                    {cityOptions.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={label}>Page</div>
                  <select style={input} value={cowHood} onChange={(e) => setCowHood(e.target.value)} disabled={!cowCity || issue.status === "sent"}>
                    <option value="">— pick —</option>
                    {hoodOptions.map((p) => (
                      <option key={p.hoodSlug} value={p.hoodSlug}>{p.hoodName}{p.isNewBuild ? " · NB" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              {cowCity && cowHood && (
                <div>
                  <div style={label}>Blurb (min 60 chars)</div>
                  <textarea style={{ ...area, minHeight: 60 }} value={cowBlurb} onChange={(e) => setCowBlurb(e.target.value)} disabled={issue.status === "sent"} />
                </div>
              )}
            </div>

            {issue.status !== "sent" && issue.status !== "canceled" && (
              <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
                <button style={btn} onClick={save} disabled={busy !== null}>{busy === "save" ? "SAVING…" : "SAVE"}</button>
                <button style={btnGhost} onClick={ready} disabled={busy !== null}>{busy === "ready" ? "LINTING…" : "MARK READY"}</button>
                <button style={btnGhost} onClick={testSend} disabled={busy !== null}>{busy === "test" ? "SENDING…" : "SEND TEST TO ME"}</button>
              </div>
            )}

            {issue.status === "ready" && (
              <div style={{ border: `2px solid ${ORANGE}`, padding: 14, marginTop: 14 }}>
                <div style={{ ...label, color: ORANGE }}>Real send — type: SEND {issue.issueDate}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  <input style={{ ...input, maxWidth: 260 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={`SEND ${issue.issueDate}`} />
                  <button
                    style={{ ...btn, background: ORANGE, borderColor: ORANGE, opacity: confirmText === `SEND ${issue.issueDate}` ? 1 : 0.5 }}
                    onClick={sendIssue}
                    disabled={busy !== null || confirmText !== `SEND ${issue.issueDate}`}
                  >
                    {busy === "send" ? "SENDING…" : `SEND TO ${counts.subscribed} SUBSCRIBER${counts.subscribed === 1 ? "" : "S"}`}
                  </button>
                </div>
              </div>
            )}

            {lint && (
              <div style={{ marginTop: 14, border: `1.5px dashed ${lint.errors.length ? ORANGE : INK}`, padding: 12, fontSize: 13 }}>
                <div style={{ ...label, marginBottom: 6 }}>LINT — {lint.errors.length} ERROR(S), {lint.warnings.length} WARNING(S)</div>
                {lint.errors.map((e, i) => <p key={`e${i}`} style={{ margin: "2px 0", color: ORANGE }}>✕ {e}</p>)}
                {lint.warnings.map((w, i) => <p key={`w${i}`} style={{ margin: "2px 0" }}>△ {w}</p>)}
                {!lint.errors.length && <p style={{ margin: "2px 0" }}>✓ ready to mark ready</p>}
              </div>
            )}
          </section>
        )}

        {/* ---- issue list ---- */}
        <section>
          <h2 style={{ fontSize: 15, letterSpacing: "0.08em", borderBottom: `1.5px solid ${INK}`, paddingBottom: 6 }}>ISSUES ({issues.length})</h2>
          {issues.length === 0 && <p style={{ fontSize: 13 }}>No issues yet — GENERATE SUNDAY DRAFT starts the first one. (Empty is expected until migration 0015 is applied.)</p>}
          {issues.map((i) => (
            <article key={i.id} onClick={() => openIssue(i)} style={{ border: `1.5px solid ${INK}`, background: CARD, padding: "12px 16px", marginTop: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{i.issueDate}</strong>{" "}
                <span style={{ fontSize: 12 }}>{i.subject ?? "(no subject yet)"}</span>
                <div style={{ fontSize: 12, marginTop: 2, color: "rgba(29,25,19,.65)" }}>
                  {i.stats ? `${i.stats.metro.actives.toLocaleString()} actives · ${i.stats.metro.new7d} new 7d` : "no numbers yet"}
                </div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", fontWeight: 700, alignSelf: "center" }}>
                {i.status.toUpperCase()}{i.status === "sent" ? ` · ${i.sentCount}✓` : ""}
              </div>
            </article>
          ))}
        </section>

        <footer className="font-mono" style={{ marginTop: 28, fontSize: 10, letterSpacing: ".06em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
          TL-2 · GENERATED FROM OUR OWN DATA (LIVE NTREIS CLASS) · PER-RECIPIENT UNSUBSCRIBE TOKENS + ONE-CLICK HEADERS ·
          letter_sends UNIQUE(ISSUE, SUBSCRIBER) MAKES DOUBLE-DELIVERY IMPOSSIBLE · NO CRON, NO BROADCAST API, NO CLAUDE WRITING
        </footer>
      </div>
    </main>
  );
}
