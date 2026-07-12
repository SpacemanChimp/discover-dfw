import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import AdminNav from "@/components/admin/AdminNav";

/* The Letter desk — TL-1 state + the TL-2 issue-builder CONCEPT. Internal
   only (same ADMIN_EMAILS gate, 404 otherwise, noindex). READ-ONLY: live
   subscriber counts via service role strictly AFTER the gate; everything
   else on this page is a preview of the approved TL-2 plan. There is NO
   send path here — the action buttons are inert placeholders, and 0015 /
   issues / cron / broadcasts all remain separately gated. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Letter",
  robots: { index: false, follow: false },
};

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

const SECTIONS = [
  { n: "01", title: "The week in numbers", note: "Metro actives, new-this-week, price cuts, median list — same LIVE NTREIS data class as the city market bands." },
  { n: "02", title: "Cities that changed their math", note: "Top movers by new-listing volume and median shift. Issue #1 shows levels; deltas bootstrap from each issue's stored stats." },
  { n: "03", title: "Community of the week", note: "Admin-picked hood or new-build page with a short blurb — pairs with Content Desk-enriched pages." },
  { n: "04", title: "From the desk", note: "Freeform editor's note. Runs the Content Desk risky-claims linter before an issue can go ready." },
  { n: "05", title: "Footer", note: "Postal address, per-recipient unsubscribe, List-Unsubscribe one-click headers — proven in TL-1." },
];

export default async function LetterDeskPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  // read-only subscriber tally (service role, after the gate)
  let counts = { subscribed: 0, pending: 0, unsubscribed: 0 };
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data } = await db.from("letter_subscribers").select("status");
      for (const r of data ?? []) counts[r.status as keyof typeof counts] = (counts[r.status as keyof typeof counts] ?? 0) + 1;
    } catch {
      /* table state is reported as zeros — page never breaks */
    }
  }

  const chip: React.CSSProperties = {
    display: "inline-block",
    padding: "10px 16px",
    border: `2px solid ${INK}`,
    background: CARD,
    borderRadius: 2,
    marginRight: 10,
    marginBottom: 10,
  };
  const deadBtn: React.CSSProperties = {
    padding: "8px 14px",
    border: "1.5px solid rgba(29,25,19,.35)",
    background: "transparent",
    color: "rgba(29,25,19,.45)",
    fontSize: 12,
    letterSpacing: "0.08em",
    fontWeight: 700,
    borderRadius: 2,
    textTransform: "uppercase" as const,
    cursor: "not-allowed",
  };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, color: INK }}>
      <AdminNav current="letter" />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>THE LETTER</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
            SUNDAY ISSUE BUILDER — CONCEPT PREVIEW · NOTHING SENDS FROM THIS PAGE · SIGNED IN AS {adminUser.email.toUpperCase()}
          </p>
        </header>

        <section style={{ marginBottom: 24 }}>
          <h2 className="font-mono" style={{ fontSize: 11, letterSpacing: ".22em", color: ORANGE, margin: "0 0 10px" }}>
            SUBSCRIBERS — LIVE (TL-1)
          </h2>
          <div>
            <span style={chip}><strong style={{ fontSize: 22 }}>{counts.subscribed}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>SUBSCRIBED</span></span>
            <span style={chip}><strong style={{ fontSize: 22 }}>{counts.pending}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>PENDING CONFIRM</span></span>
            <span style={chip}><strong style={{ fontSize: 22 }}>{counts.unsubscribed}</strong> <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em" }}>UNSUBSCRIBED</span></span>
          </div>
        </section>

        <section style={{ border: `2px solid ${INK}`, background: CARD, padding: 20 }}>
          <h2 className="font-mono" style={{ fontSize: 11, letterSpacing: ".22em", color: ORANGE, margin: "0 0 4px" }}>
            THE SUNDAY ISSUE — TL-2 CONCEPT (PENDING APPROVAL)
          </h2>
          <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.75)" }}>
            Each week: a draft issue is generated from our own data, edited here in your voice, test-sent to you,
            then sent by an explicit human action. No auto-broadcast anywhere.
          </p>

          {SECTIONS.map((s) => (
            <div key={s.n} style={{ borderTop: "1px solid rgba(29,25,19,.18)", padding: "12px 0" }}>
              <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".22em", color: ORANGE }}>
                {s.n}
              </div>
              <strong style={{ fontSize: 15.5 }}>{s.title}</strong>
              <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.55, color: "rgba(29,25,19,.72)" }}>{s.note}</p>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button style={deadBtn} disabled>Regenerate data</button>
            <button style={deadBtn} disabled>Send test to me</button>
            <button style={deadBtn} disabled>Send issue</button>
            <span className="font-mono" style={{ alignSelf: "center", fontSize: 10, letterSpacing: ".14em", color: "rgba(29,25,19,.55)" }}>
              INERT — TL-2 IMPLEMENTATION, MIGRATION 0015, CRON, AND EVERY SEND ARE SEPARATE GATES
            </span>
          </div>
        </section>

        <footer className="font-mono" style={{ marginTop: 24, fontSize: 10, letterSpacing: ".08em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
          TL-1 LIVE: DOUBLE OPT-IN SIGNUP, CONFIRMATION + WELCOME EMAILS, ONE-CLICK UNSUBSCRIBE · SENDER letter@discoverdfw.com ·
          CAN-SPAM FOOTER: 2201 SPINKS RD. #248, FLOWER MOUND, TEXAS 75022
        </footer>
      </main>
    </div>
  );
}
