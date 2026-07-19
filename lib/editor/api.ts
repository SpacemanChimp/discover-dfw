/* Shared plumbing for the EDITOR desk API routes — SERVER-ONLY.

   Every route: 404-shaped for anyone outside ADMIN_EMAILS (the surface is
   never advertised), same-origin enforcement on state-changing methods
   (the Supabase auth cookie is SameSite=Lax, this adds an explicit
   belt-and-braces origin check), 503 with migrationApplied:false while
   migration 0018 is unapplied, and JSON body size caps. */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";

export const MAX_JSON_BODY = 262_144; // 256 KB — documents cap at 200 KB

export interface EditorCtx {
  admin: { id: string; email: string };
  db: SupabaseClient;
}

export async function editorGate(req: Request): Promise<EditorCtx | NextResponse> {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface

  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return NextResponse.json({ ok: false, error: "Cross-origin request refused" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
      }
    }
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  return { admin, db };
}

/** relation/function missing → migration 0018 not applied yet. The desk
    shows its migration-not-applied state; writes surface a clear 503. */
export function migrationMissing(message: string | undefined | null): boolean {
  return /does not exist|schema cache|Could not find/i.test(message ?? "");
}

export function migration503() {
  return NextResponse.json(
    { ok: false, migrationApplied: false, error: "Editor storage is not available yet — migration 0018_visual_editor.sql has not been applied" },
    { status: 503 }
  );
}

export async function readJsonBody<T>(req: Request): Promise<T | NextResponse> {
  const raw = await req.text();
  if (raw.length > MAX_JSON_BODY) {
    return NextResponse.json({ ok: false, error: `Request too large (${raw.length} bytes; limit ${MAX_JSON_BODY})` }, { status: 413 });
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
}
