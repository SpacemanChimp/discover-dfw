import "server-only";

/* Conversion panels render ONLY when the lead backend is actually
   configured — a form that stores nothing must never appear. Send-safety
   (FUB/email dry-run outside production) is enforced separately in
   lib/crm/fub.ts and lib/email/resend.ts, so local/staging renders real
   forms whose downstream sends are dry-run. */
export function leadBackendReady(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
}
