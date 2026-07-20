import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { processManualUpload } from "@/lib/content/manual-upload";

/* CI-7 manual photo upload. Admin-only (same ADMIN_EMAILS gate as the
   Photo Desk — checked before anything is read); one file per request;
   creates a PENDING manual_upload photo_candidate only. Publishing stays
   a separate explicit confirmation through the CI-6 approve RPC — no
   second publish path, no bulk anything, no silent replace.

   The processing pipeline (size cap, byte-decode, format/dimension/
   orientation checks, EXIF-stripping sharp re-encode, storage write,
   evidence-complete pending candidate) lives in
   lib/content/manual-upload.ts, SHARED byte-for-byte with the Community
   Studio's one-action upload-&-approve route. Runs in the NODE runtime
   (sharp needs native bindings — never Edge). */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const result = await processManualUpload(db, adminUser.email, {
    file: form.get("file"),
    slotId: form.get("slotId"),
    attributionText: String(form.get("attributionText") ?? "").trim(),
    caption: String(form.get("caption") ?? "").trim(),
    rightsConfirmed: form.get("rightsConfirmed") === "true",
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    candidateId: result.candidateId,
    imageUrl: result.imageUrl,
    width: result.width,
    height: result.height,
    note: "Pending candidate created — publish via APPROVE in the Photo Desk",
  });
}
