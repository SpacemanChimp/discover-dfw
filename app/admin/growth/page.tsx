import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";
import GrowthDesk from "@/components/admin/GrowthDesk";

/* The Growth Command Center — internal only. Admin allowlist gate (404
   for everyone else, including signed-in non-admins), never indexed,
   never linked from public nav. Pure shell: all data flows through
   GET /api/admin/growth, which runs its own admin gate. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Growth Command Center",
  robots: { index: false, follow: false },
};

export default async function GrowthCommandCenterPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  return (
    <>
      <AdminNav current="growth" />
      <GrowthDesk />
    </>
  );
}
