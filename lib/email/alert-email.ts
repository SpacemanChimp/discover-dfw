/* The alert digest — one calm email per user per run, in the field-guide
   voice and palette. Inline styles only (email clients). */
import { SITE_URL } from "@/lib/site";

export interface AlertItem {
  alertType: "price_drop" | "status_change" | "open_house";
  listingKey: string;
  address: string;
  cityName: string;
  detail: {
    fromPrice?: number;
    toPrice?: number;
    fromStatus?: string;
    toStatus?: string;
    date?: string;
    window?: string;
  };
}

const money = (n: number) => "$" + n.toLocaleString("en-US");
const spaceStatus = (s: string) => s.replace(/([A-Z])/g, " $1").trim();

function line(a: AlertItem): { tag: string; text: string } {
  switch (a.alertType) {
    case "price_drop":
      return {
        tag: "PRICE CUT",
        text: `${money(a.detail.fromPrice!)} → ${money(a.detail.toPrice!)} (−${money(
          a.detail.fromPrice! - a.detail.toPrice!
        )})`,
      };
    case "status_change":
      return {
        tag: "STATUS",
        text: `${spaceStatus(a.detail.fromStatus!)} → ${spaceStatus(a.detail.toStatus!)}`,
      };
    case "open_house": {
      const day = new Date(a.detail.date! + "T12:00:00Z").toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      return { tag: "OPEN HOUSE", text: `${day}, ${a.detail.window}` };
    }
  }
}

export function buildAlertEmail(alerts: AlertItem[]): { subject: string; html: string } {
  const n = alerts.length;
  const first = alerts[0];
  const subject =
    n === 1
      ? first.alertType === "price_drop"
        ? `Price cut on ${first.address}`
        : first.alertType === "open_house"
        ? `Open house at ${first.address}`
        : `Status change on ${first.address}`
      : `${n} updates on your shelf`;

  const rows = alerts
    .map((a) => {
      const l = line(a);
      return `
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid rgba(29,25,19,.14);">
          <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.18em;color:#D9481F;">${l.tag}</div>
          <div style="font-size:15px;font-weight:600;color:#1D1913;margin-top:4px;">
            <a href="${SITE_URL}/listing/${a.listingKey}" style="color:#1D1913;text-decoration:none;">${a.address}, ${a.cityName}</a>
          </div>
          <div style="font-size:13.5px;color:rgba(29,25,19,.75);margin-top:3px;">${l.text}</div>
        </td>
      </tr>`;
    })
    .join("");

  const html = `
  <div style="background:#F6F1E6;padding:28px 12px;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;text-align:center;">DISCOVER DFW — FROM YOUR SHELF</div>
      <h1 style="font-size:26px;font-weight:900;color:#1D1913;text-align:center;margin:10px 0 18px;">${
        n === 1 ? "Word from the market." : `${n} things moved.`
      }</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EE;border:2px solid #1D1913;border-radius:16px;border-collapse:separate;overflow:hidden;">
        ${rows}
        <tr>
          <td style="padding:16px 18px;text-align:center;">
            <a href="${SITE_URL}/account/saved-homes" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:12px 26px;">Open your shelf</a>
          </td>
        </tr>
      </table>
      <div style="font-family:Menlo,Consolas,monospace;font-size:9px;letter-spacing:.16em;color:rgba(29,25,19,.5);text-align:center;margin-top:16px;">
        LIVE NTREIS DATA · YOU GET THESE BECAUSE YOU SAVED THESE HOMES
      </div>
    </div>
  </div>`;

  return { subject, html };
}
