import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";

/* The Admin Console — the front door for every internal desk. Internal
   only: admin allowlist gate (404 for everyone else, including signed-in
   non-admins), never indexed, never linked from public nav. Pure
   navigation — no data reads, no actions, no service-role client. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Console",
  robots: { index: false, follow: false },
};

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const CARD = "#FBF7EE";
const ORANGE = "#D9481F";

type Desk = {
  eyebrow: string;
  title: string;
  blurb: string;
  href?: string; // absent = future/gated, renders disabled
  gateNote?: string;
};

const DESKS: Desk[] = [
  {
    eyebrow: "00 — PAGES",
    title: "Editor",
    blurb: "Visual editing for approved editorial regions — draft, preview on the real page, publish. Code content stays the fallback.",
    href: "/admin/editor",
  },
  {
    eyebrow: "01 — PEOPLE",
    title: "Lead Desk",
    blurb: "Showing requests, listing questions, event trail, shelf engagement.",
    href: "/admin/leads",
  },
  {
    eyebrow: "02 — PICTURES",
    title: "Photo Desk",
    blurb: "Review sourced candidates, upload owned photos, approve → publish. The only path a photo takes to the site.",
    href: "/admin/photos",
  },
  {
    eyebrow: "03 — PLACES",
    title: "Community Builder",
    blurb: "Draft new hood / new-build entries with MLS lookup and collision guards. Publishing stays a reviewed PR.",
    href: "/admin/communities",
  },
  {
    eyebrow: "04 — PROSE",
    title: "SEO Content (legacy)",
    blurb: "The older structured workflow: linted drafts exported through the gated PR pipeline. For visual editing with instant preview, use the Editor desk.",
    href: "/admin/communities?view=content",
  },
  {
    eyebrow: "05 — POST",
    title: "The Letter / Newsletter",
    blurb: "Subscriber counts and the Sunday issue builder. Sending stays behind its own gates.",
    href: "/admin/letter",
  },
  {
    eyebrow: "06 — PIPELINE",
    title: "New Build Controls",
    blurb: "Per-community publish switches for the live inventory bands — typed confirmation per flip, caution states first.",
    href: "/admin/newbuilds",
  },
  {
    eyebrow: "07 — PIPELINE",
    title: "Sourcing & Scoring Queues",
    blurb: "Photo sourcing batches and Claude candidate scoring.",
    gateNote: "FUTURE — CLI-gated today (CI-4 / CI-5)",
  },
];

export default async function AdminConsolePage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  return (
    <div style={{ minHeight: "100vh", background: CREAM, color: INK }}>
      <AdminNav current="console" />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
        <header style={{ borderBottom: `3px solid ${INK}`, paddingBottom: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "0.02em" }}>ADMIN CONSOLE</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, letterSpacing: "0.06em" }}>
            EVERY DESK IN ONE PLACE · SIGNED IN AS {adminUser.email.toUpperCase()}
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {DESKS.map((d) => {
            const inner = (
              <>
                <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".22em", color: d.href ? ORANGE : "rgba(29,25,19,.45)" }}>
                  {d.eyebrow}
                </div>
                <h2 style={{ margin: "8px 0 6px", fontSize: 19, fontWeight: 800 }}>{d.title}</h2>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.75)" }}>{d.blurb}</p>
                <div className="font-mono" style={{ marginTop: 12, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: d.href ? INK : "rgba(29,25,19,.5)" }}>
                  {d.href ? "OPEN →" : d.gateNote}
                </div>
              </>
            );
            const cardStyle: React.CSSProperties = {
              border: `2px solid ${d.href ? INK : "rgba(29,25,19,.3)"}`,
              background: d.href ? CARD : "transparent",
              padding: "18px 20px",
              borderRadius: 2,
              display: "block",
              color: INK,
              textDecoration: "none",
            };
            return d.href ? (
              <a key={d.title} href={d.href} style={cardStyle}>
                {inner}
              </a>
            ) : (
              <div key={d.title} style={cardStyle}>
                {inner}
              </div>
            );
          })}
        </div>

        <footer className="font-mono" style={{ marginTop: 28, fontSize: 10, letterSpacing: ".08em", color: "rgba(29,25,19,.55)", lineHeight: 1.9 }}>
          NOTHING HERE PUBLISHES BY ITSELF — PHOTOS PUBLISH VIA DESK APPROVAL, DATA/CONTENT VIA REVIEWED PRs, EMAIL VIA
          SEPARATELY-GATED SENDS · 404 FOR EVERYONE OUTSIDE THE ALLOWLIST
        </footer>
      </main>
    </div>
  );
}
