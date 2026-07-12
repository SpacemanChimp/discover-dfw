import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getCommunityDrafts, cityOptions } from "@/lib/content/community-drafts";
import { getContentDrafts, pageInventory } from "@/lib/content/community-content-drafts";
import CommunityBuilder from "@/components/admin/CommunityBuilder";
import ContentEditor from "@/components/admin/ContentEditor";
import AdminNav from "@/components/admin/AdminNav";

/* The Community Builder — CB-1 drafting desk + CB-3a CONTENT desk
   (?view=content). Internal only: admin allowlist gate (404 for everyone
   else, including signed-in non-admins), never indexed, never linked from
   public nav. Service-role reads happen strictly AFTER the gate. Both
   desks are workspaces — nothing here creates or changes a public page;
   publishing is the separately-gated CB-2 exporter writing
   lib/dfw.data.json / lib/hood-content.json on a reviewed branch. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Builder",
  robots: { index: false, follow: false },
};

export default async function CommunityBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const { view } = await searchParams;
  if (view === "content") {
    const drafts = await getContentDrafts();
    return (
      <>
        <AdminNav current="content" />
        <ContentEditor adminEmail={adminUser.email} drafts={drafts} pages={pageInventory()} />
      </>
    );
  }
  const drafts = await getCommunityDrafts();
  return (
    <>
      <AdminNav current="communities" />
      <CommunityBuilder adminEmail={adminUser.email} drafts={drafts} cities={cityOptions()} />
    </>
  );
}
