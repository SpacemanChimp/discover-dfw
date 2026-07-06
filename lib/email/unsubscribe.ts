/* One-click unsubscribe tokens for saved-search digests. SERVER-ONLY.

   Token = `${searchId}.${hmacSHA256(searchId, CRON_SECRET)}` — no table,
   no expiry (the worst a leaked token can do is turn one search's email
   off), verified with a timing-safe compare. CRON_SECRET doubles as the
   signing key: it's already a random server-side secret in every
   environment that can send email. */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const key = () => process.env.CRON_SECRET || "";

export function signUnsubscribeToken(searchId: string): string | null {
  const k = key();
  if (!k) return null;
  const sig = createHmac("sha256", k).update(searchId).digest("base64url");
  return `${searchId}.${sig}`;
}

/** Returns the search id when the signature checks out, else null. */
export function verifyUnsubscribeToken(token: string): string | null {
  const k = key();
  if (!k) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expect = Buffer.from(createHmac("sha256", k).update(id).digest("base64url"));
  try {
    return sig.length === expect.length && timingSafeEqual(sig, expect) ? id : null;
  } catch {
    return null;
  }
}
