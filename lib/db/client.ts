"use client";
/* Browser Supabase client — publishable key only; every query passes RLS.
   Singleton so listeners and session state are shared across components.
   Returns null when env vars are absent (e.g. a deploy before Vercel env
   setup) so the site degrades to guest-only instead of crashing. */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key ? createBrowserClient(url, key) : null;
  return client;
}

export const isSupabaseConfigured = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
