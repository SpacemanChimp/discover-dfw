/* Saved-search digest — "your standing order found something." Ledger-style
   rows in the field-guide palette; recurring mail, so every send carries a
   working unsubscribe link (plus List-Unsubscribe headers set by the
   sweep). Inline styles only. */
import type { Listing } from "@/lib/mls/types";
import { SITE_URL } from "@/lib/site";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const money = (n: number) => "$" + n.toLocaleString("en-US");

export function buildSearchDigestEmail(opts: {
  searchName: string;
  queryLabel: string;
  queryString: string;
  listings: Listing[];
  totalNew: number;
  unsubscribeUrl: string | null;
}): { subject: string; html: string } {
  const { searchName, queryLabel, queryString, listings, totalNew, unsubscribeUrl } = opts;
  const n = totalNew;
  const subject =
    n === 1
      ? `New on the market — ${listings[0].unparsedAddress}, ${listings[0].cityName}`
      : `${n} new for "${searchName}"`;

  const rows = listings
    .map((l) => {
      const photo = l.media[0]?.url;
      const facts = [
        l.bedsTotal ? `${l.bedsTotal} bd` : null,
        l.bathsTotal ? `${l.bathsTotal} ba` : null,
        l.livingAreaSqft ? `${l.livingAreaSqft.toLocaleString("en-US")} sqft` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid rgba(29,25,19,.14);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            ${photo ? `<td width="86" style="vertical-align:top;"><a href="${SITE_URL}/listing/${l.listingKey}"><img src="${photo}" alt="" width="74" height="56" style="border-radius:8px;object-fit:cover;border:1.5px solid #1D1913;display:block;" /></a></td>` : ""}
            <td style="vertical-align:top;">
              <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.18em;color:#D9481F;">${esc(l.badge)} · ${money(l.listPrice)}</div>
              <div style="font-size:15px;font-weight:600;color:#1D1913;margin-top:3px;">
                <a href="${SITE_URL}/listing/${l.listingKey}" style="color:#1D1913;text-decoration:none;">${esc(l.unparsedAddress)}, ${esc(l.cityName)}</a>
              </div>
              <div style="font-size:12.5px;color:rgba(29,25,19,.7);margin-top:2px;">${esc(facts)}${l.neighborhood ? ` · ${esc(l.neighborhood)}` : ""}</div>
            </td>
          </tr></table>
        </td>
      </tr>`;
    })
    .join("");

  const more = n > listings.length
    ? `<tr><td style="padding:10px 18px;border-bottom:1px solid rgba(29,25,19,.14);font-size:13px;color:rgba(29,25,19,.65);text-align:center;">+ ${n - listings.length} more waiting on the search page</td></tr>`
    : "";

  const html = `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;text-align:center;">DISCOVER DFW — YOUR STANDING ORDER</div>
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 6px;">${n === 1 ? "One new arrival." : `${n} new arrivals.`}</h1>
      <div style="font-family:Menlo,Consolas,monospace;font-size:9.5px;letter-spacing:.16em;color:rgba(29,25,19,.55);text-align:center;margin-bottom:16px;">${esc(queryLabel.toUpperCase())}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;">
        ${rows}
        ${more}
        <tr>
          <td style="padding:16px 18px;text-align:center;">
            <a href="${SITE_URL}/homes?${queryString}" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:12px 26px;">Run the search</a>
          </td>
        </tr>
      </table>
      <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.16em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;line-height:2;">
        LIVE NTREIS DATA · YOU SAVED THIS SEARCH AT DISCOVERDFW.COM<br/>
        <a href="${SITE_URL}/account/saved-searches" style="color:rgba(29,25,19,.6);">CHANGE CADENCE</a>
        ${unsubscribeUrl ? ` &nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:rgba(29,25,19,.6);">UNSUBSCRIBE THIS SEARCH</a>` : ""}
      </div>
    </div>
  </div>`;

  return { subject, html };
}
