import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";

/* Lead status updates from the Lead Desk. Admin-only (env allowlist);
   the service-role client is used strictly AFTER the gate. */

const TABLES: Record<string, string> = {
  showing: "showing_requests",
  question: "listing_questions",
};
const STATUSES = new Set(["new", "contacted", "scheduled", "closed"]);

export async function PATCH(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  let body: { kind?: string; id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const table = TABLES[body.kind || ""];
  if (!table) return NextResponse.json({ ok: false, error: "Unknown lead kind" }, { status: 400 });
  if (!body.id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  if (!STATUSES.has(body.status || ""))
    return NextResponse.json({ ok: false, error: "Unknown status" }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });

  const { data, error } = await db.from(table).update({ status: body.status }).eq("id", body.id).select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
