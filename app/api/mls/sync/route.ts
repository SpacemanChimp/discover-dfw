import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { RESIDENTIAL_PROPERTY_TYPES } from "@/lib/mls/feature-search";
import { dfwCities, dfwCountyNames } from "@/data/dfw-cities";
import {
  TRESTLE_ODATA_BASE_URL as API_BASE,
  TRESTLE_TOKEN_URL as TOKEN_URL,
  trestleCredentials,
} from "@/lib/mls/trestle-env";

/* MLS replication sync — Trestle/NTREIS → local Postgres (migration 0006).
   Invoked by Vercel Cron (daily) or manually with the CRON_SECRET; safe to
   run as often as you like.

   Two modes, self-detected:
   - BACKFILL (until a run is marked backfill-complete): walks the
     on-market inventory (Active/AUC/ComingSoon/Pending) in the 53 curated
     cities by ModificationTimestamp ascending, resuming from
     max(modification_timestamp) already stored. Each invocation processes
     pages until the time budget runs out; the cursor makes it resumable.
   - INCREMENTAL (after backfill): same walk WITHOUT the status filter, so
     status flips (Pending → Closed, withdrawals) reach the local rows.

   Bookkeeping: one mls_sync_runs row per invocation; per-page failures in
   mls_sync_errors; city_market_snapshots upserted once caught up.

   Pagination is keyset on (ModificationTimestamp, ListingKey) — NTREIS
   bulk jobs stamp many records with identical timestamps, so a plain
   timestamp cursor drops records at page boundaries (measured ~4% drift).

   Manual params (secret still required):
   - ?full=1       one-shot repair walk from epoch (status-filtered), for
                   drift repair; run locally/manually — needs a big budget.
   - ?budget=ms    extend the time budget (capped on Vercel).
   - ?dryrun=1     fetch + map + count, write NOTHING (no listings, media,
                   snapshots, or mode markers) — safe testing.
   - ?limit=N      stop after ~N records — small first runs.
   - ?reconcile=1  no paging; diff feed on-market keys vs local rows and
                   mark local-only ones OffMarket (hard-deleted records
                   never emit a status flip). Composes with dryrun.
   - ?nomedia=1    skip the Media $expand and media writes — a fast repair
                   walk when only scalar/raw fields (e.g. school/district)
                   need re-populating; existing media rows are left intact. */

export const maxDuration = 300; // Vercel Pro

const PAGE_SIZE = 200;
const TIME_BUDGET_MS = 240_000; // leave room for snapshots + bookkeeping
const ONMARKET = ["Active", "ActiveUnderContract", "ComingSoon", "Pending"];

const SELECT = [
  "ListingKey", "ListingId", "StandardStatus", "ListPrice", "OriginalListPrice", "ClosePrice",
  "CloseDate", "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull", "BathroomsHalf",
  "LivingArea", "LotSizeAcres", "YearBuilt", "PropertyType", "PropertySubType", "StreetNumber",
  "StreetName", "UnparsedAddress", "City", "StateOrProvince", "PostalCode", "CountyOrParish",
  "SubdivisionName", "Latitude", "Longitude", "PublicRemarks", "ListOfficeName",
  "OriginatingSystemName", "ModificationTimestamp", "PhotosCount", "CumulativeDaysOnMarket",
  "NewConstructionYN", "ArchitecturalStyle",
  // MLS-reported schools — land in `raw` for the local provider. Rows synced
  // before this line need a full backfill (?full=1) to pick them up; until
  // then detail pages supplement live via trestle getListingSchools().
  "ElementarySchool", "ElementarySchoolDistrict", "MiddleOrJuniorSchool",
  "MiddleOrJuniorSchoolDistrict", "HighSchool", "HighSchoolDistrict",
  // Feature-search fields (0023 generated columns read these from `raw`).
  // PoolFeatures/Levels are 100% populated structured enums in NTREIS;
  // GarageSpaces ~88%. PoolPrivateYN (1.8%) and StoriesTotal (2.7%) were
  // audited and rejected — kept out on purpose. Rows synced before this
  // line need the ?full=1&nomedia=1 repair walk.
  "PoolFeatures", "GarageSpaces", "Levels",
].join(",");

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/* Ingestion geographic boundary: the 8 DFW-metro counties, UNION the 90
   curated city names (belt-and-suspenders so no curated-city listing is ever
   dropped if its CountyOrParish is blank/variant). This replaces the old
   90-city-only clause so every municipality in the metro — Corinth, Copper
   Canyon, Bartonville, Double Oak, … — is replicated and therefore findable
   by a school/district search, without adding city-profile pages for them. */
const GEO_CLAUSE = `(CountyOrParish in (${dfwCountyNames.map(q).join(",")}) or City in (${dfwCities.map((c) => q(c.name)).join(",")}))`;

async function getToken(): Promise<string> {
  const creds = trestleCredentials();
  if (!creds) throw new Error("Trestle credentials missing");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.id, client_secret: creds.secret, scope: "api" }),
  });
  if (!res.ok) throw new Error(`Trestle token failed: ${res.status}`);
  return (await res.json()).access_token as string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const stripNulls = (o: Record<string, any>) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => v != null && k !== "Media"));

function mapRow(p: any) {
  return {
    listing_key: String(p.ListingKey),
    listing_id: String(p.ListingId ?? p.ListingKey),
    standard_status: p.StandardStatus ?? "Unknown",
    list_price: p.ListPrice ?? null,
    close_price: p.ClosePrice ?? null,
    beds: p.BedroomsTotal ?? null,
    baths: p.BathroomsTotalInteger ?? (p.BathroomsFull != null ? p.BathroomsFull + (p.BathroomsHalf ?? 0) * 0.5 : null),
    living_area: p.LivingArea ?? null,
    lot_size: p.LotSizeAcres ?? null,
    year_built: p.YearBuilt ?? null,
    property_type: p.PropertyType ?? "",
    property_sub_type: p.PropertySubType ?? null,
    street_number: p.StreetNumber ?? null,
    street_name: p.StreetName ?? null,
    unparsed_address: p.UnparsedAddress ?? "",
    city: p.City ?? "",
    state: p.StateOrProvince ?? "TX",
    postal_code: p.PostalCode ?? null,
    county: p.CountyOrParish ?? null,
    subdivision: p.SubdivisionName ?? null,
    // the feed occasionally drops the minus sign from longitude (Texas is
    // always negative) — recover it; null anything implausible for DFW
    ...(() => {
      let lat = p.Latitude ?? null;
      let lon = p.Longitude ?? null;
      if (lon != null && lon > 0 && lat != null && lat > 25 && lat < 37) lon = -lon;
      if (lat != null && (lat < 25 || lat > 37)) { lat = null; lon = null; }
      if (lon != null && (lon < -104 || lon > -93)) { lat = null; lon = null; }
      return { latitude: lat, longitude: lon };
    })(),
    public_remarks: p.PublicRemarks ?? null,
    list_office_name: p.ListOfficeName ?? null,
    list_agent_name: null, // populate only once IDX display rules are confirmed to permit it
    originating_system_name: p.OriginatingSystemName ?? null,
    modification_timestamp: p.ModificationTimestamp,
    photos_count: p.PhotosCount ?? null,
    // the feed contains garbage negatives (e.g. -208) — null them so they
    // sort last on "newest" instead of first
    days_on_market:
      p.CumulativeDaysOnMarket != null && p.CumulativeDaysOnMarket >= 0 ? p.CumulativeDaysOnMarket : null,
    raw: stripNulls(p), // selected fields only, nulls dropped — server-only
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "No admin client" }, { status: 503 });

  const started = Date.now();
  const { data: run } = await db
    .from("mls_sync_runs")
    .insert({ provider: "trestle" })
    .select("id")
    .single();
  const runId = run?.id as string;

  const logError = async (stage: string, message: string, listingKey?: string, detail?: unknown) => {
    await db.from("mls_sync_errors").insert({
      run_id: runId,
      listing_key: listingKey ?? null,
      stage,
      message: message.slice(0, 500),
      detail: detail ? JSON.parse(JSON.stringify(detail)) : null,
    });
  };

  let seen = 0;
  let upserted = 0;
  let failed = 0;
  let pages = 0;
  let backfillComplete = false;
  let status: "success" | "partial" | "failed" = "success";
  let errorSummary: string | null = null;

  const reqUrl = new URL(req.url);
  const fullWalk = reqUrl.searchParams.get("full") === "1";
  const dryRun = reqUrl.searchParams.get("dryrun") === "1";
  const limit = Math.max(0, Number(reqUrl.searchParams.get("limit")) || 0);
  const reconcile = reqUrl.searchParams.get("reconcile") === "1";
  const noMedia = reqUrl.searchParams.get("nomedia") === "1";
  const budgetParam = Number(reqUrl.searchParams.get("budget")) || TIME_BUDGET_MS;
  // Vercel serverless caps at maxDuration; only local/manual runs may go long
  const timeBudget = process.env.VERCEL ? Math.min(budgetParam, TIME_BUDGET_MS) : budgetParam;
  // heavy $expand=Media pages can outrun the gateway when the feed slows —
  // manual walks may shrink pages so no single request runs long
  const pageSize = Math.min(
    PAGE_SIZE,
    Math.max(25, Number(reqUrl.searchParams.get("pagesize")) || PAGE_SIZE)
  );

  try {
    const token = await getToken();

    /* ---- reconcile mode: catch hard-deleted feed records ---- */
    if (reconcile) {
      const feedKeys = new Set<string>();
      let lastKey = "";
      // walk all on-market keys, keyset on ListingKey
      for (;;) {
        const filter =
          `${GEO_CLAUSE} and PropertyType in ('Residential','ResidentialIncome','Land')` +
          ` and StandardStatus in (${ONMARKET.map(q).join(",")})` +
          (lastKey ? ` and ListingKey gt ${q(lastKey)}` : "");
        const res = await fetch(
          `${API_BASE}/Property?$filter=${encodeURIComponent(filter)}&$orderby=ListingKey asc&$top=1000&$select=ListingKey`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }
        );
        if (!res.ok) throw new Error(`reconcile fetch: ${res.status}`);
        const rows = (await res.json()).value as { ListingKey: string }[];
        for (const r of rows) feedKeys.add(String(r.ListingKey));
        if (!rows.length || rows.length < 1000) break;
        lastKey = String(rows[rows.length - 1].ListingKey);
      }
      // local on-market keys, paged
      const localKeys: string[] = [];
      for (let page = 0; ; page++) {
        const { data } = await db
          .from("listings")
          .select("listing_key")
          .in("standard_status", ONMARKET)
          .order("listing_key")
          .range(page * 1000, page * 1000 + 999);
        for (const r of data ?? []) localKeys.push(r.listing_key);
        if (!data?.length || data.length < 1000) break;
      }
      const zombies = localKeys.filter((k) => !feedKeys.has(k));
      if (!dryRun) {
        for (let i = 0; i < zombies.length; i += 200) {
          await db
            .from("listings")
            .update({ standard_status: "OffMarket" })
            .in("listing_key", zombies.slice(i, i + 200));
        }
      }
      await db
        .from("mls_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          records_seen: feedKeys.size,
          records_upserted: dryRun ? 0 : zombies.length,
          error_summary: dryRun ? "reconcile dry-run" : "reconcile",
        })
        .eq("id", runId);
      return NextResponse.json({
        ok: true,
        mode: "reconcile",
        dryRun,
        feedOnMarket: feedKeys.size,
        localOnMarket: localKeys.length,
        markedOffMarket: dryRun ? 0 : zombies.length,
        wouldMarkOffMarket: zombies.length,
        ms: Date.now() - started,
      });
    }

    // mode: incremental once any run carries the backfill-complete marker
    const { data: marker } = await db
      .from("mls_sync_runs")
      .select("id")
      .eq("error_summary", "backfill-complete")
      .limit(1);
    const incremental = !!marker?.length && !fullWalk;

    // keyset cursor: resume from the newest (timestamp, key) we hold
    let cursorTs = "1970-01-01T00:00:00Z";
    let cursorKey = "";
    // a full walk no longer fits one time budget (90 cities) — callers thread
    // the response's `cursor` back via ?cursor=ts|key to resume the repair
    // walk instead of restarting from epoch. Strictly validated: both parts
    // are interpolated into the OData filter.
    const cursorParam = reqUrl.searchParams.get("cursor") ?? "";
    let cursorResumed = false;
    if (fullWalk && cursorParam.includes("|")) {
      const [ts, key] = cursorParam.split("|");
      // feed timestamps carry an explicit offset ("…-00:00"), not just Z
      if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})?$/.test(ts) && /^\d*$/.test(key)) {
        cursorTs = ts;
        cursorKey = key;
        cursorResumed = true;
      }
    }
    if (!fullWalk) {
      const { data: cursorRow } = await db
        .from("listings")
        .select("modification_timestamp")
        .order("modification_timestamp", { ascending: false })
        .limit(1);
      if (cursorRow?.[0]) {
        cursorTs = cursorRow[0].modification_timestamp;
        const { data: keyRow } = await db
          .from("listings")
          .select("listing_key")
          .eq("modification_timestamp", cursorTs)
          .order("listing_key", { ascending: false })
          .limit(1);
        cursorKey = keyRow?.[0]?.listing_key ?? "";
      }
    }

    const typeClause = "PropertyType in ('Residential','ResidentialIncome','Land')";
    const statusClause = incremental ? "" : ` and StandardStatus in (${ONMARKET.map(q).join(",")})`;

    while (Date.now() - started < timeBudget) {
      // keyset: strictly-after (ts) OR same-ts-later-key — no boundary drops
      const cursorClause = cursorKey
        ? `(ModificationTimestamp gt ${cursorTs} or (ModificationTimestamp eq ${cursorTs} and ListingKey gt ${q(cursorKey)}))`
        : `ModificationTimestamp gt ${cursorTs}`;
      const filter = `${GEO_CLAUSE} and ${typeClause}${statusClause} and ${cursorClause}`;
      const url =
        `${API_BASE}/Property?$filter=${encodeURIComponent(filter)}` +
        `&$orderby=${encodeURIComponent("ModificationTimestamp asc,ListingKey asc")}&$top=${pageSize}` +
        `&$select=${SELECT}` +
        (noMedia ? "" : `&$expand=${encodeURIComponent("Media($orderby=Order;$top=50)")}`);

      let rows: any[];
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
        if (!res.ok) throw new Error(`OData ${res.status}: ${(await res.text()).slice(0, 200)}`);
        rows = (await res.json()).value ?? [];
      } catch (e) {
        await logError("fetch", String(e));
        status = "partial";
        break;
      }
      if (!rows.length) {
        if (!incremental) backfillComplete = true;
        break;
      }
      pages++;
      seen += rows.length;

      const keys = rows.map((p: any) => String(p.ListingKey));
      // the feed withholds OriginalListPrice (null on every record), so we
      // track price history ourselves: one select per page, carry forward
      const { data: prevRows } = await db
        .from("listings")
        .select('listing_key, list_price, prev:raw->PreviousListPrice')
        .in("listing_key", keys);
      const prevByKey = new Map((prevRows ?? []).map((r: any) => [r.listing_key, r]));

      const mapped = rows.map((p: any) => {
        const m = mapRow(p);
        const before = prevByKey.get(m.listing_key);
        if (before) {
          const oldPrice = Number(before.list_price);
          const newPrice = Number(m.list_price);
          if (oldPrice > 0 && newPrice > 0 && oldPrice !== newPrice) {
            (m.raw as any).PreviousListPrice = oldPrice; // price moved — remember where from
          } else if (before.prev != null) {
            (m.raw as any).PreviousListPrice = Number(before.prev); // no move — keep history
          }
        }
        return m;
      });
      if (dryRun) {
        // count + advance the in-memory cursor only; nothing is written
        upserted += mapped.length;
        const lastDry = rows[rows.length - 1];
        cursorTs = lastDry.ModificationTimestamp;
        cursorKey = String(lastDry.ListingKey);
        if (rows.length < pageSize) { if (!incremental) backfillComplete = true; break; }
        if (limit && seen >= limit) break;
        continue;
      }

      const { error: upErr } = await db.from("listings").upsert(mapped, { onConflict: "listing_key" });
      if (upErr) {
        // one bad row can poison a batch upsert — retry row-by-row so the rest land
        for (const m of mapped) {
          const { error } = await db.from("listings").upsert(m, { onConflict: "listing_key" });
          if (error) {
            failed++;
            await logError("upsert", error.message, m.listing_key);
          } else upserted++;
        }
      } else {
        upserted += mapped.length;
      }

      // media: replace wholesale per listing (feed order is authoritative).
      // Skipped in nomedia repair walks — existing media rows stay intact.
      if (!noMedia) {
      const media = rows.flatMap((p: any) =>
        (Array.isArray(p.Media) ? p.Media : [])
          .filter((m: any) => m.MediaURL)
          .map((m: any, i: number) => ({
            listing_key: String(p.ListingKey),
            media_key: m.OriginatingSystemMediaKey ?? m.MediaKey ?? null,
            media_url: m.MediaURL,
            order: m.Order ?? i,
            media_type: m.MediaType ?? "Photo",
            modification_timestamp: m.ModificationTimestamp ?? null,
          }))
      );
      try {
        await db.from("listing_media").delete().in("listing_key", keys);
        if (media.length) {
          const { error } = await db.from("listing_media").insert(media);
          if (error) throw new Error(error.message);
        }
      } catch (e) {
        failed++;
        await logError("media", String(e));
        status = "partial";
      }
      }

      const last = rows[rows.length - 1];
      cursorTs = last.ModificationTimestamp;
      cursorKey = String(last.ListingKey);
      if (rows.length < pageSize) {
        if (!incremental) backfillComplete = true;
        break;
      }
      if (limit && seen >= limit) break;
    }

    // snapshots: only once the local store is a complete picture
    let snapshotsWritten = 0;
    if (!dryRun && (incremental || backfillComplete) && Date.now() - started < timeBudget + 10_000) {
      for (const c of dfwCities) {
        // PAGE the per-city scan: PostgREST caps every response at 1,000
        // rows regardless of .limit() (the Phase 21 lesson) — the old
        // .limit(2000) silently floored big-city counts at 1,000 AND
        // computed medians over an arbitrary 1,000-row sample (Dallas
        // snapshot median read $145K against a ~$400K reality).
        //
        // RESIDENTIAL DEFINITION (launch hardening, 2026-08-30): snapshot
        // medians/ppsf/dom/counts cover Residential + ResidentialIncome
        // ONLY — the same inventory the default home search returns.
        // Vacant land (PropertyType='Land') skewed the blend materially
        // (Dallas all-property $399K vs residential $425K, +6.5%); land
        // stats live on /land's own live queries, never mixed in here.
        // First residential-only rows land on the NEXT daily sync.
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data: page, error: pageErr } = await db
            .from("listings")
            .select("list_price, living_area, dom:raw->CumulativeDaysOnMarket")
            .eq("city", c.name)
            .eq("standard_status", "Active")
            .in("property_type", [...RESIDENTIAL_PROPERTY_TYPES])
            .range(from, from + 999);
          if (pageErr) {
            await logError("snapshot", pageErr.message, c.slug);
            break;
          }
          rows.push(...(page ?? []));
          if ((page ?? []).length < 1000) break;
        }
        const prices = rows.map((r: any) => Number(r.list_price)).filter((x) => x > 0);
        const ppsf = rows
          .filter((r: any) => Number(r.list_price) > 0 && Number(r.living_area) > 0)
          .map((r: any) => Number(r.list_price) / Number(r.living_area));
        const doms = rows.map((r: any) => Number(r.dom)).filter((x) => Number.isFinite(x) && x >= 0);
        const { error } = await db.from("city_market_snapshots").upsert(
          {
            city_slug: c.slug,
            as_of: new Date().toISOString().slice(0, 10),
            active_listings: rows.length,
            median_list_price: median(prices),
            price_per_sqft: ppsf.length ? Math.round(median(ppsf)!) : null,
            median_days_on_market: doms.length ? Math.round(median(doms)!) : null,
            source: "trestle",
          },
          { onConflict: "city_slug,as_of" }
        );
        if (!error) snapshotsWritten++;
      }
    }

    if (failed > 0 && status === "success") status = "partial";
    // NEVER persist the backfill-complete mode marker from a dry run
    errorSummary = dryRun ? "dry-run" : backfillComplete ? "backfill-complete" : errorSummary;

    await db
      .from("mls_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        records_seen: seen,
        records_upserted: upserted,
        records_failed: failed,
        error_summary: errorSummary,
      })
      .eq("id", runId);

    return NextResponse.json({
      ok: true,
      mode: incremental ? "incremental" : fullWalk ? "full-repair" : "backfill",
      dryRun,
      ...(limit ? { limit } : {}),
      pages,
      seen,
      upserted,
      failed,
      backfillComplete,
      // callers MUST check this when threading cursors — a rejected cursor
      // silently restarts the walk from epoch
      cursorResumed,
      cursor: `${cursorTs}|${cursorKey}`,
      snapshotsWritten,
      ms: Date.now() - started,
    });
  } catch (e) {
    await logError("fetch", String(e));
    await db
      .from("mls_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        records_seen: seen,
        records_upserted: upserted,
        records_failed: failed,
        error_summary: String(e).slice(0, 500),
      })
      .eq("id", runId);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
