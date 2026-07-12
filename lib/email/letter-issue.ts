/* The Letter — Sunday issue template (TL-2). Pure rendering: takes a
   frozen issue record and produces subject + HTML with a PER-RECIPIENT
   placeholder (%%UNSUB_URL%%) that the send loop substitutes with each
   subscriber's own signed unsubscribe link before every send. Field-guide
   ledger styling, inline styles only (mirrors the digest template). */
import { SITE_URL } from "@/lib/site";
import { LETTER_POSTAL_ADDRESS } from "@/lib/email/letter";

export const UNSUB_PLACEHOLDER = "%%UNSUB_URL%%";

export type IssueCityStat = {
  slug: string;
  name: string;
  actives: number;
  new7d: number;
  median: number | null;
  /** previous issue's median for the delta line (absent on issue #1) */
  medianPrev?: number | null;
};

export type IssueStats = {
  generatedAt: string;
  metro: { actives: number; new7d: number };
  cities: IssueCityStat[];
};

export type IssueSections = {
  editorsNote: string;
  communityOfWeek: { citySlug: string; hoodSlug: string; name: string; blurb: string } | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function buildLetterIssueEmail(opts: {
  issueDate: string; // YYYY-MM-DD
  subject: string;
  sections: IssueSections;
  stats: IssueStats;
  /** true only for the admin test copy — banners the email as a test */
  isTest?: boolean;
}): { subject: string; html: string } {
  const { issueDate, subject, sections, stats, isTest } = opts;
  const dateLabel = new Date(issueDate + "T12:00:00Z")
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase();

  const movers = [...stats.cities].sort((a, b) => b.new7d - a.new7d).slice(0, 5);
  const moverRows = movers
    .map((c) => {
      const delta =
        c.median != null && c.medianPrev != null && c.medianPrev !== 0
          ? ((c.median - c.medianPrev) / c.medianPrev) * 100
          : null;
      // DELTA GUARD: |Δ| > 10%/wk in a city's median list price is a data
      // artifact (the capped-history transition week, or sample-mix noise
      // as inventory rotates), not news — suppress the chip rather than
      // print an absurdity. Counts and medians themselves stay visible.
      const deltaLabel =
        delta == null || Math.abs(delta) > 10
          ? ""
          : ` · median ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% wk`;
      return `
      <tr><td style="padding:10px 18px;border-bottom:1px solid rgba(29,25,19,.14);">
        <div style="font-size:15px;font-weight:600;color:#1D1913;">
          <a href="${SITE_URL}/city/${c.slug}" style="color:#1D1913;text-decoration:none;">${esc(c.name)}</a>
        </div>
        <div style="font-family:Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;color:rgba(29,25,19,.6);margin-top:2px;">
          ${c.new7d} NEW THIS WEEK · ${c.actives} ACTIVE${c.median != null ? ` · MEDIAN ${money(c.median)}` : ""}${esc(deltaLabel.toUpperCase())}
        </div>
      </td></tr>`;
    })
    .join("");

  const cow = sections.communityOfWeek;
  const noteParas = sections.editorsNote
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="font-size:15px;line-height:1.75;color:rgba(29,25,19,.82);margin:0 0 12px;">${esc(p)}</p>`)
    .join("");

  const html = `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      ${isTest ? `<div style="background:#D9481F;color:#F6F1E6;font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.2em;text-align:center;padding:8px;">TEST COPY — NOT A SUBSCRIBER SEND</div>` : ""}
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;text-align:center;">DISCOVER DFW — THE LETTER · ${dateLabel}</div>
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 16px;">${esc(subject)}</h1>

      ${noteParas ? `<div style="margin-bottom:18px;">${noteParas}</div>` : ""}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;margin-bottom:18px;">
        <tr><td style="padding:14px 18px;border-bottom:1.5px solid #1D1913;">
          <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.2em;color:#D9481F;">THE WEEK IN NUMBERS</div>
          <div style="font-size:15px;color:#1D1913;margin-top:6px;">
            <strong>${stats.metro.actives.toLocaleString("en-US")}</strong> homes on the market metro-wide ·
            <strong>${stats.metro.new7d.toLocaleString("en-US")}</strong> listed in the last 7 days
          </div>
          <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.55);margin-top:4px;">LIVE NTREIS DATA · MLS-MATCHED COUNTS</div>
        </td></tr>
        <tr><td style="padding:10px 18px 4px;">
          <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.2em;color:#D9481F;">CITIES THAT CHANGED THEIR MATH</div>
        </td></tr>
        ${moverRows}
      </table>

      ${
        cow
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;margin-bottom:18px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.2em;color:#D9481F;">COMMUNITY OF THE WEEK</div>
          <div style="font-size:17px;font-weight:700;color:#1D1913;margin-top:6px;">${esc(cow.name)}</div>
          <p style="font-size:14px;line-height:1.7;color:rgba(29,25,19,.78);margin:6px 0 12px;">${esc(cow.blurb)}</p>
          <a href="${SITE_URL}/city/${cow.citySlug}/${cow.hoodSlug}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;padding:11px 22px;">Read the field guide</a>
        </td></tr>
      </table>`
          : ""
      }

      <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.14em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;line-height:2;">
        YOU'RE GETTING THE LETTER BECAUSE YOU CONFIRMED YOUR SUBSCRIPTION AT DISCOVERDFW.COM.<br/>
        <a href="${UNSUB_PLACEHOLDER}" style="color:rgba(29,25,19,.6);">UNSUBSCRIBE</a> ANY TIME — ONE CLICK, NO QUESTIONS.<br/>
        DISCOVER DFW · ${LETTER_POSTAL_ADDRESS.toUpperCase()}
      </div>
    </div>
  </div>`;

  return { subject, html };
}
