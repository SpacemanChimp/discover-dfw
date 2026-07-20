import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";
import EditorDesk from "@/components/admin/editor/EditorDesk";

/* The EDITOR desk — visual editing for the code-owned registry of
   editable regions. Admin allowlist gate (404 for everyone else), never
   indexed. All data flows through /api/admin/editor/* which re-checks the
   gate on every request. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editor Desk",
  robots: { index: false, follow: false },
};

export default async function AdminEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  return (
    <div style={{ minHeight: "100vh", background: "#F6F1E6", color: "#1D1913" }}>
      <AdminNav current="editor" />
      <EditorDesk
        adminEmail={adminUser.email}
        initialRoute={str(params.route)}
        initialMode={str(params.mode)}
        initialCommunity={str(params.community)}
        initialTab={str(params.tab)}
      />
    </div>
  );
}
