import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getCommunityDrafts, cityOptions } from "@/lib/content/community-drafts";
import CommunityBuilder from "@/components/admin/CommunityBuilder";

/* The Community Builder — CB-1 drafting desk. Internal only: admin
   allowlist gate (404 for everyone else, including signed-in non-admins),
   never indexed, never linked from public nav. Service-role reads happen
   strictly AFTER the gate. Drafts are a workspace — nothing here creates
   a public page; publishing is the separately-gated CB-2 exporter
   writing lib/dfw.data.json on a reviewed branch. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Builder",
  robots: { index: false, follow: false },
};

export default async function CommunityBuilderPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const drafts = await getCommunityDrafts();
  return <CommunityBuilder adminEmail={adminUser.email} drafts={drafts} cities={cityOptions()} />;
}
