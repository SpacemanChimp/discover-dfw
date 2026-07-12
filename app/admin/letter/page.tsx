import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { getLetterIssues } from "@/lib/content/letter-issues";
import { pageInventory } from "@/lib/content/community-content-drafts";
import AdminNav from "@/components/admin/AdminNav";
import LetterDesk from "@/components/admin/LetterDesk";

/* The Letter desk (TL-2) — the real Sunday issue builder. Internal only
   (same ADMIN_EMAILS gate, 404 otherwise, noindex). Reads happen
   strictly AFTER the gate. NOTHING auto-sends: issue generation reads
   our own data, test copies go only to the signed-in admin, and a real
   send requires the typed phrase in the desk. Until migration 0015 is
   applied the issue list is empty and every action 503s. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Letter",
  robots: { index: false, follow: false },
};

export default async function LetterDeskPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const issues = await getLetterIssues();

  let counts = { subscribed: 0, pending: 0, unsubscribed: 0 };
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data } = await db.from("letter_subscribers").select("status");
      for (const r of data ?? []) counts[r.status as keyof typeof counts] = (counts[r.status as keyof typeof counts] ?? 0) + 1;
    } catch {
      /* zeros — the page never breaks */
    }
  }

  return (
    <>
      <AdminNav current="letter" />
      <LetterDesk adminEmail={adminUser.email} issues={issues} counts={counts} pages={pageInventory()} />
    </>
  );
}
