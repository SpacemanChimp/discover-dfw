import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { verifyLetterToken } from "@/lib/email/letter";
import { SITE_URL } from "@/lib/site";

/* One-click unsubscribe for saved-search digests AND The Letter (TL-1).
   GET  — the human click from the email footer → tiny branded page.
   POST — RFC 8058 one-click (List-Unsubscribe-Post) from mail clients.
   Both verify the HMAC token; the two token kinds are scope-separated by
   construction (digest tokens sign the bare searchId, letter tokens sign
   `letter-unsub:${id}`), so each is tried in turn and a token can only
   ever operate on its own table. No session required — the token IS the
   authorization. */

type UnsubResult = { ok: boolean; kind: "digest" | "letter" | null };

async function unsubscribe(token: string | null): Promise<UnsubResult> {
  if (!token) return { ok: false, kind: null };
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, kind: null };

  const searchId = verifyUnsubscribeToken(token);
  if (searchId) {
    const { data, error } = await admin
      .from("saved_searches")
      .update({ email_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", searchId)
      .select("id");
    if (!error && data?.length) return { ok: true, kind: "digest" };
  }

  const subscriberId = verifyLetterToken("letter-unsub", token);
  if (subscriberId) {
    const { data, error } = await admin
      .from("letter_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
      .eq("id", subscriberId)
      .select("id");
    if (!error && data?.length) return { ok: true, kind: "letter" };
  }

  return { ok: false, kind: null };
}

const page = (headline: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<meta name="robots" content="noindex,nofollow"/><title>${headline} — Discover DFW</title></head>
<body style="margin:0;background:#F6F1E6;font-family:Georgia,serif;color:#1D1913;">
  <div style="max-width:460px;margin:0 auto;padding:80px 20px;text-align:center;">
    <div style="font-family:Menlo,Consolas,monospace;font-size:10px;font-weight:bold;letter-spacing:.26em;color:#D9481F;">DISCOVER DFW</div>
    <h1 style="font-size:30px;font-weight:900;margin:14px 0 10px;">${headline}</h1>
    <p style="font-size:15px;line-height:1.7;color:rgba(29,25,19,.75);margin:0;">${body}</p>
    <a href="${SITE_URL}/account/saved-searches" style="display:inline-block;background:#D9481F;color:#F6F1E6;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px;padding:13px 26px;margin-top:26px;">Manage your standing orders</a>
  </div>
</body></html>`;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const res = await unsubscribe(token);
  const body =
    res.kind === "letter"
      ? page("You're off the list.", "The Letter won't email you again. If you change your mind, the signup form on the homepage restarts the whole thing — confirmation and all.")
      : res.ok
        ? page("Quiet, as requested.", "That standing order stays saved — it just won't email you. Flip it back on any time from your shelf.")
        : page("That link didn't take.", "It may be malformed or for a subscription that no longer exists. You can manage saved-search emails from your shelf, or re-do a Letter signup from the homepage.");
  return new NextResponse(body, {
    status: res.ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* RFC 8058 one-click — mail clients POST here without loading a page. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const res = await unsubscribe(token);
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 400 });
}
