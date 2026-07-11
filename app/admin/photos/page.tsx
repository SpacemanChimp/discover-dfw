import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { getPhotoReviewQueue } from "@/lib/content/admin-photos";
import PhotoReviewQueue from "@/components/admin/PhotoReviewQueue";

/* The Photo Desk — CI-6 review queue. Internal only: admin allowlist gate
   (404 for everyone else, including signed-in non-admins), never indexed,
   never linked from public nav. Service-role reads happen strictly AFTER
   the gate. Approving here is the ONLY path that publishes an editorial
   photo, and every action is one explicit human POST. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Photo Desk",
  robots: { index: false, follow: false },
};

export default async function PhotoDeskPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const slots = await getPhotoReviewQueue();
  return <PhotoReviewQueue adminEmail={adminUser.email} slots={slots} />;
}
