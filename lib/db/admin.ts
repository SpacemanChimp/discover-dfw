/* Admin Supabase client — SECRET KEY, bypasses RLS. SERVER-ONLY:
   import "server-only" makes any client-bundle import a build error.
   Used exclusively by route handlers that must write past RLS (leads).
   Returns null when the secret isn't configured so callers can fall back. */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  admin =
    url && secret
      ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return admin;
}
