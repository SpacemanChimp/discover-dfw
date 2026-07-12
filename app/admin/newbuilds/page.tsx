import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getNbControlRows } from "@/lib/content/admin-newbuilds";
import AdminNav from "@/components/admin/AdminNav";
import NewBuildControls from "@/components/admin/NewBuildControls";

/* New Build Controls — inventory-band publish switches. Internal only
   (same ADMIN_EMAILS gate, 404 otherwise, noindex). Service-role reads
   strictly AFTER the gate. Flips require a typed confirmation per
   community and the FIRST flip through this UI is its own supervised
   gate. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Build Controls",
  robots: { index: false, follow: false },
};

export default async function NewBuildControlsPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const rows = await getNbControlRows();
  return (
    <>
      <AdminNav current="newbuilds" />
      <NewBuildControls adminEmail={adminUser.email} rows={rows} />
    </>
  );
}
