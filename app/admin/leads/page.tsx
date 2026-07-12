import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import AdminLeadList, { type AdminLead, type LeadEvent, type ShelfCount } from "@/components/admin/AdminLeadList";
import AdminNav from "@/components/admin/AdminNav";

/* The Lead Desk — internal only. Admin allowlist gate (404 for everyone
   else, including signed-in non-admins), never indexed, never linked
   from public nav. Service-role reads happen strictly AFTER the gate. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lead Desk",
  robots: { index: false, follow: false },
};

const fmtWindow = (day: string, window: string, mode: string) => {
  const d = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${d}, ${window} — ${mode === "live_video" ? "live video" : "in person"}`;
};

export default async function LeadDeskPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();
  const db = getSupabaseAdmin();
  if (!db) notFound();

  const [sr, lq, ev, homes, searches, users] = await Promise.all([
    db.from("showing_requests").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("listing_questions").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("lead_events").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("saved_listings").select("user_id"),
    db.from("saved_searches").select("user_id"),
    db.auth.admin.listUsers({ page: 1, perPage: 500 }),
  ]);

  const emailById = new Map<string, string>();
  for (const u of users.data?.users ?? []) if (u.email) emailById.set(u.id, u.email);

  // listing → city comes from the event trail (the lead tables don't carry it)
  const cityByListing = new Map<string, string>();
  for (const e of ev.data ?? []) {
    if (e.listing_key && e.city_slug && !cityByListing.has(e.listing_key))
      cityByListing.set(e.listing_key, e.city_slug);
  }

  const leads: AdminLead[] = [
    ...(sr.data ?? []).map((r) => ({
      kind: "showing" as const,
      id: r.id as string,
      listingKey: r.listing_key as string,
      citySlug: cityByListing.get(r.listing_key) ?? null,
      name: r.name as string,
      email: r.email as string,
      phone: (r.phone as string) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
      summary: fmtWindow(r.requested_day, r.requested_time_window, r.showing_mode),
      message: (r.message as string) ?? null,
      userEmail: r.user_id ? emailById.get(r.user_id) ?? null : null,
    })),
    ...(lq.data ?? []).map((r) => ({
      kind: "question" as const,
      id: r.id as string,
      listingKey: r.listing_key as string,
      citySlug: cityByListing.get(r.listing_key) ?? null,
      name: r.name as string,
      email: r.email as string,
      phone: (r.phone as string) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
      summary: r.question as string,
      message: null,
      userEmail: r.user_id ? emailById.get(r.user_id) ?? null : null,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const events: LeadEvent[] = (ev.data ?? []).map((e) => ({
    eventType: e.event_type as string,
    listingKey: (e.listing_key as string) ?? null,
    citySlug: (e.city_slug as string) ?? null,
    sourcePage: (e.source_page as string) ?? "",
    createdAt: e.created_at as string,
    userEmail: e.user_id ? emailById.get(e.user_id) ?? null : null,
    metadata: (e.metadata as Record<string, unknown>) ?? {},
  }));

  // shelf engagement: saves + standing orders per account
  const counts = new Map<string, ShelfCount>();
  const bump = (userId: string | null, field: "savedHomes" | "savedSearches") => {
    if (!userId) return;
    const email = emailById.get(userId) ?? userId.slice(0, 8) + "…";
    const row = counts.get(userId) ?? { email, savedHomes: 0, savedSearches: 0 };
    row[field] += 1;
    counts.set(userId, row);
  };
  for (const r of homes.data ?? []) bump(r.user_id, "savedHomes");
  for (const r of searches.data ?? []) bump(r.user_id, "savedSearches");
  const shelfCounts = [...counts.values()].sort(
    (a, b) => b.savedHomes + b.savedSearches - (a.savedHomes + a.savedSearches)
  );

  return (
    <>
      <AdminNav current="leads" />
      <AdminLeadList
        adminEmail={adminUser.email}
        leads={leads}
        events={events}
        shelfCounts={shelfCounts}
      />
    </>
  );
}
