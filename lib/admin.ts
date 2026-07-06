/* Admin gate — SERVER-ONLY.

   There is no role system yet; authorization is an env allowlist:
   ADMIN_EMAILS = comma-separated emails (case-insensitive). A visitor is
   an admin iff they hold a real Supabase session AND their email is on
   the list. Unset list → nobody is admin → admin surfaces 404.

   Upgrade path (documented in docs/mls-search-build-plan.md): move to a
   `role` column on `profiles` with an RLS-readable claim once more than
   a couple of humans need access. */
import "server-only";
import { getSupabaseServer } from "@/lib/db/server";

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return null;
  try {
    const session = await getSupabaseServer();
    const user = (await session?.auth.getUser())?.data.user;
    if (!user?.email) return null;
    return allow.includes(user.email.toLowerCase()) ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}
