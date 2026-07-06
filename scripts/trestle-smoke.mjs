#!/usr/bin/env node
/* Trestle smoke test — SERVER-ONLY utility, never bundled.
   Fetches a token and a handful of listings + media to prove the
   credentials and endpoints work.

     node scripts/trestle-smoke.mjs            (reads env, falls back to .env.local)
     node scripts/trestle-smoke.mjs frisco     (optional city filter)

   Env (either naming convention):
     TRESTLE_API_ID / TRESTLE_API_PASSWORD
     TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET
     TRESTLE_TOKEN_URL / TRESTLE_ODATA_BASE_URL   (optional overrides)

   Prints listing summaries only — NEVER tokens or credentials. Exits 2
   with a friendly message when credentials are absent. */
import { readFileSync, existsSync } from "node:fs";

// fall back to .env.local for local runs outside Next
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).trim();
  }
}

const id = process.env.TRESTLE_API_ID || process.env.TRESTLE_CLIENT_ID;
const secret = process.env.TRESTLE_API_PASSWORD || process.env.TRESTLE_CLIENT_SECRET;
const TOKEN_URL = process.env.TRESTLE_TOKEN_URL || "https://api-trestle.corelogic.com/trestle/oidc/connect/token";
const BASE = process.env.TRESTLE_ODATA_BASE_URL || "https://api-trestle.corelogic.com/trestle/odata";

if (!id || !secret) {
  console.log("Trestle credentials not configured — set TRESTLE_API_ID/TRESTLE_API_PASSWORD");
  console.log("(or TRESTLE_CLIENT_ID/TRESTLE_CLIENT_SECRET). Nothing was fetched.");
  process.exit(2);
}

const city = process.argv[2];

try {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "api" }),
  });
  if (!tokenRes.ok) {
    console.error(`token request failed: HTTP ${tokenRes.status}`); // status only — no body, no secrets
    process.exit(1);
  }
  const { access_token, expires_in } = await tokenRes.json();
  console.log(`token OK (expires in ${expires_in}s)`);

  const filter = [
    "PropertyType eq 'Residential'",
    "StandardStatus eq 'Active'",
    city ? `City eq '${city.replace(/'/g, "''").replace(/\b\w/g, (c) => c.toUpperCase())}'` : null,
  ].filter(Boolean).join(" and ");

  const url =
    `${BASE}/Property?$filter=${encodeURIComponent(filter)}` +
    `&$top=3&$count=true&$select=ListingKey,ListingId,ListPrice,UnparsedAddress,City,BedroomsTotal,PhotosCount` +
    `&$expand=${encodeURIComponent("Media($orderby=Order;$top=2)")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
  if (!res.ok) {
    console.error(`Property query failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const j = await res.json();
  console.log(`matched ${j["@odata.count"]} active listings${city ? ` in ${city}` : ""}; showing ${j.value.length}:`);
  for (const p of j.value) {
    const media = Array.isArray(p.Media) ? p.Media.filter((m) => m.MediaURL).length : 0;
    console.log(
      `  ${p.ListingKey}  $${(p.ListPrice ?? 0).toLocaleString("en-US")}  ${p.BedroomsTotal ?? "?"}bd  ` +
      `${p.UnparsedAddress}, ${p.City}  (${p.PhotosCount ?? 0} photos, ${media} media sampled)`
    );
  }
  console.log("smoke test PASSED");
} catch (e) {
  console.error("smoke test failed:", e?.message ?? String(e)); // message only — no secrets in our thrown errors
  process.exit(1);
}
