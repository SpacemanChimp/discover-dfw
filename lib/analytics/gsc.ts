/* Google Search Console — official Search Analytics API, SERVER-ONLY.
   Auth is a Google service account (JWT RS256 signed with node:crypto —
   no SDK dependency); the service-account email must be added as a user
   on the sc-domain property in Search Console. Never scraped, never a
   browser session, never fabricated: when credentials are absent the
   dashboard renders an explicit NOT-CONNECTED state.

   Required environment variables (exact names surfaced in that state):
     GSC_CLIENT_EMAIL   — the service account's client_email
     GSC_PRIVATE_KEY    — the service account's private_key (PEM; \n-escaped ok)
     GSC_PROPERTY       — optional; defaults to sc-domain:discoverdfw.com */
import "server-only";
import { createSign } from "node:crypto";
import { unstable_cache } from "next/cache";

export const GSC_REQUIRED_ENV = ["GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY"];
const DEFAULT_PROPERTY = "sc-domain:discoverdfw.com";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function gscConfigured(): boolean {
  return Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY);
}

const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string | null> {
  const email = process.env.GSC_CLIENT_EMAIL;
  let key = process.env.GSC_PRIVATE_KEY;
  if (!email || !key) return null;
  key = key.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  let signature: string;
  try {
    signature = signer.sign(key, "base64url");
  } catch {
    return null; // malformed key — treated as not connected
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function queryRaw(body: Record<string, unknown>): Promise<GscRow[] | null> {
  const token = await accessToken();
  if (!token) return null;
  const property = encodeURIComponent(process.env.GSC_PROPERTY || DEFAULT_PROPERTY);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${property}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { rows?: GscRow[] };
  return j.rows ?? [];
}

/** cached one hour per (dimension, window) — quota-friendly for a weekly
    operating dashboard */
export async function gscQuery(opts: {
  startDate: string;
  endDate: string;
  dimensions: ("page" | "query" | "date")[];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  if (!gscConfigured()) return null;
  const keyParts = ["gsc", opts.startDate, opts.endDate, opts.dimensions.join("+"), String(opts.rowLimit ?? 200)];
  const cached = unstable_cache(
    () =>
      queryRaw({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions,
        rowLimit: opts.rowLimit ?? 200,
        dataState: "final",
      }),
    keyParts,
    { revalidate: 3600 }
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}

export function gscTotals(rows: GscRow[] | null): { clicks: number; impressions: number; ctr: number; position: number } | null {
  if (!rows) return null;
  let clicks = 0, impressions = 0, posWeighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    posWeighted += r.position * r.impressions;
  }
  return {
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
    position: impressions ? Math.round((posWeighted / impressions) * 10) / 10 : 0,
  };
}
