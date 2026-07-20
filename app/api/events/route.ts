import { NextResponse } from "next/server";
import { draftMode } from "next/headers";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { cleanEvent } from "@/lib/analytics/events";
import { SITE_URL } from "@/lib/site";

/* First-party conversion event intake. PUBLIC (no auth — anonymous
   visitors are the point) but write-only, closed-world, and self-limiting:

   · every submission passes lib/analytics/events.ts (12-event allowlist,
     shape-checked context, query-stripped paths, PII refusal) — the
     endpoint stores the sanitizer's output, never the client's document;
   · idempotent: the client-minted event_id is unique-indexed, so
     sendBeacon/keepalive retries and double-mounted effects insert once;
   · admin and Draft-Mode preview traffic is dropped (200 with
     dropped:true — the client should never care);
   · failures are invisible to the visitor by design: this endpoint always
     answers quickly and the caller never awaits it.

   The service key never reaches the browser: writes happen HERE through
   lib/db/admin, and site_events has RLS with no policies. */

export const dynamic = "force-dynamic";

const MAX_BODY = 4096;

export async function POST(req: Request) {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // admin + preview traffic never lands in analytics
  try {
    if (await getAdminUser()) return NextResponse.json({ ok: true, dropped: true });
  } catch {
    /* auth store unreachable — treat as anonymous */
  }
  try {
    if ((await draftMode()).isEnabled) return NextResponse.json({ ok: true, dropped: true });
  } catch {
    /* no draft-mode context */
  }

  const selfHost = (() => {
    try {
      return new URL(SITE_URL).hostname.replace(/^www\./, "");
    } catch {
      return undefined;
    }
  })();
  const cleaned = cleanEvent(raw, { selfHost });
  if (!cleaned.ok) return NextResponse.json({ ok: false, error: cleaned.reason }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, dropped: true }); // analytics never breaks a workflow

  const { error } = await db.from("site_events").upsert(cleaned.row, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) {
    // migration not applied / transient DB issue — still a quiet 200:
    // the visitor's workflow must never observe analytics failures
    return NextResponse.json({ ok: true, dropped: true });
  }
  return NextResponse.json({ ok: true });
}
