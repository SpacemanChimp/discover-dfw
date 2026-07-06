import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getMlsProvider } from "@/lib/mls";
import type { SearchFilters } from "@/lib/mls/types";
import { sendEmail } from "@/lib/email/resend";
import { buildAlertEmail, type AlertItem } from "@/lib/email/alert-email";
import { buildSearchDigestEmail } from "@/lib/email/search-digest";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe";
import { SITE_URL } from "@/lib/site";

/* The alert sweep — invoked by Vercel Cron (daily) or manually with the
   secret. Two passes, both idempotent:
   1. saved LISTINGS: price/status/open-house alerts, one digest per user,
      last_seen_* baselines advance so nothing repeats.
   2. saved SEARCHES ("standing orders"): new-inventory digests per due
      frequency; last_notified_at advances only after a successful send.
   Runs on the admin client by design: it is a system job spanning all
   users; RLS still guards every client surface. */

export const maxDuration = 60;

interface SaveRow {
  id: string;
  user_id: string;
  listing_key: string;
  last_seen_price: number | null;
  last_seen_status: string | null;
  last_seen_open_house: string | null;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No admin client" }, { status: 503 });
  const provider = getMlsProvider();

  const [{ data: saves }, { data: profiles }] = await Promise.all([
    admin
      .from("saved_listings")
      .select("id, user_id, listing_key, last_seen_price, last_seen_status, last_seen_open_house"),
    admin.from("profiles").select("id, email, alerts_opt_out"),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const byUser = new Map<string, SaveRow[]>();
  for (const s of (saves ?? []) as SaveRow[]) {
    (byUser.get(s.user_id) ?? byUser.set(s.user_id, []).get(s.user_id)!).push(s);
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  let usersEmailed = 0;
  let alertsCreated = 0;
  let baselinesSeeded = 0;

  for (const [userId, rows] of byUser) {
    const profile = profileById.get(userId);
    const userAlerts: AlertItem[] = [];

    for (const s of rows) {
      const listing = await provider.getListingByKey(s.listing_key);
      const updates: Record<string, unknown> = {};

      if (!listing) {
        // saved home left the feed entirely
        if (s.last_seen_status && s.last_seen_status !== "OffMarket") {
          userAlerts.push({
            alertType: "status_change",
            listingKey: s.listing_key,
            address: s.listing_key,
            cityName: "",
            detail: { fromStatus: s.last_seen_status, toStatus: "OffMarket" },
          });
          updates.last_seen_status = "OffMarket";
        }
      } else {
        // price
        if (s.last_seen_price == null) {
          updates.last_seen_price = listing.listPrice;
          baselinesSeeded++;
        } else if (listing.listPrice < s.last_seen_price) {
          userAlerts.push({
            alertType: "price_drop",
            listingKey: s.listing_key,
            address: listing.unparsedAddress,
            cityName: listing.cityName,
            detail: { fromPrice: s.last_seen_price, toPrice: listing.listPrice },
          });
          updates.last_seen_price = listing.listPrice;
        } else if (listing.listPrice > s.last_seen_price) {
          // price went up — no alert, just move the baseline
          updates.last_seen_price = listing.listPrice;
        }

        // status
        if (!s.last_seen_status) {
          updates.last_seen_status = listing.standardStatus;
          baselinesSeeded++;
        } else if (listing.standardStatus !== s.last_seen_status) {
          userAlerts.push({
            alertType: "status_change",
            listingKey: s.listing_key,
            address: listing.unparsedAddress,
            cityName: listing.cityName,
            detail: { fromStatus: s.last_seen_status, toStatus: listing.standardStatus },
          });
          updates.last_seen_status = listing.standardStatus;
        }

        // open house (next upcoming, by signature)
        const next = (listing.openHouses ?? [])
          .filter((o) => o.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        const sig = next ? `${next.date}|${next.window}` : null;
        if (sig && sig !== s.last_seen_open_house) {
          userAlerts.push({
            alertType: "open_house",
            listingKey: s.listing_key,
            address: listing.unparsedAddress,
            cityName: listing.cityName,
            detail: { date: next!.date, window: next!.window },
          });
          updates.last_seen_open_house = sig;
        }
      }

      if (Object.keys(updates).length) {
        await admin.from("saved_listings").update(updates).eq("id", s.id);
      }
    }

    if (!userAlerts.length) continue;
    alertsCreated += userAlerts.length;

    const emailable = !!profile?.email && !profile.alerts_opt_out;
    const emailedAt = emailable ? new Date().toISOString() : null;

    await admin.from("alerts").insert(
      userAlerts.map((a) => ({
        user_id: userId,
        listing_key: a.listingKey,
        alert_type: a.alertType,
        detail: { ...a.detail, address: a.address, cityName: a.cityName },
        emailed_at: emailedAt,
      }))
    );

    if (emailable) {
      const { subject, html } = buildAlertEmail(userAlerts);
      const sent = await sendEmail({ to: profile!.email, subject, html });
      if (sent.ok) usersEmailed++;
    }
  }

  /* ---- pass 2: saved-search digests ("standing orders") ---- */

  const { data: searchRows } = await admin
    .from("saved_searches")
    .select("id, user_id, name, filters, query_label, query_string, frequency, email_enabled, created_at, last_notified_at")
    .eq("email_enabled", true)
    .neq("frequency", "off");

  let searchesChecked = 0;
  let digestsSent = 0;
  const nowMs = Date.now();
  // daily (and instant, until a realtime tier exists) ≈ 20h; weekly ≈ 6d19h
  const dueMs = (freq: string) => (freq === "weekly" ? 6.8 * 86_400_000 : 0.83 * 86_400_000);

  for (const row of searchRows ?? []) {
    searchesChecked++;
    const profile = profileById.get(row.user_id);
    if (!profile?.email || profile.alerts_opt_out) continue;

    // baseline: last digest, or the moment the order was placed
    const baselineMs = Date.parse(row.last_notified_at ?? row.created_at);
    if (nowMs - baselineMs < dueMs(row.frequency)) continue;

    let fresh;
    try {
      const filters = (row.filters ?? {}) as SearchFilters;
      const result = await provider.searchListings({
        ...filters,
        statuses: ["Active"],
        sort: "newest",
        pageSize: 50,
        page: 1,
      });
      fresh = result.listings.filter((l) => Date.parse(l.listDate) > baselineMs);
    } catch (e) {
      console.error("[sweep] search digest query failed:", row.id, e);
      continue; // one broken search never sinks the sweep
    }
    if (!fresh.length) continue;

    const token = signUnsubscribeToken(row.id);
    const unsubscribeUrl = token ? `${SITE_URL}/api/email/unsubscribe?token=${token}` : null;
    const { subject, html } = buildSearchDigestEmail({
      searchName: row.name,
      queryLabel: row.query_label ?? row.name,
      queryString: row.query_string ?? "",
      listings: fresh.slice(0, 8),
      totalNew: fresh.length,
      unsubscribeUrl,
    });
    const sent = await sendEmail({
      to: profile.email,
      subject,
      html,
      // Gmail/Yahoo bulk-sender rules: one-click unsubscribe on recurring mail
      headers: unsubscribeUrl
        ? {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    });
    if (sent.ok) {
      digestsSent++;
      await admin
        .from("saved_searches")
        .update({ last_notified_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    ok: true,
    savesChecked: saves?.length ?? 0,
    alertsCreated,
    usersEmailed,
    baselinesSeeded,
    searchesChecked,
    digestsSent,
  });
}
