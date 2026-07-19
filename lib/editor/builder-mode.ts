/* Builder-canvas mode detection — SERVER-ONLY.

   A page renders in builder mode ONLY when BOTH are true:
     1. Next.js Draft Mode is enabled (the httpOnly bypass cookie that only
        the admin-gated preview route can issue), AND
     2. the `__bb` cookie is set (issued by the same route when the request
        came from the builder's canvas frame).

   Anonymous visitors can never satisfy (1), so builder markup — wrapper
   divs, data-bb attributes, the canvas runtime — never reaches public
   HTML. Reading cookies() only happens behind the Draft Mode check, so
   static/ISR rendering of public pages is untouched. */
import "server-only";
import { cookies, draftMode } from "next/headers";

export const BUILDER_COOKIE = "__bb";

export async function isBuilderMode(): Promise<boolean> {
  try {
    if (!(await draftMode()).isEnabled) return false;
    return (await cookies()).get(BUILDER_COOKIE)?.value === "1";
  } catch {
    return false;
  }
}
