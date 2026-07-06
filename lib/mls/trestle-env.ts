/* Trestle endpoint + credential resolution — SERVER-ONLY, shared by the
   live provider and the sync job. Nothing here is ever logged or sent to
   the client.

   Credentials accept both naming conventions:
     TRESTLE_API_ID / TRESTLE_API_PASSWORD        (original)
     TRESTLE_CLIENT_ID / TRESTLE_CLIENT_SECRET    (alias)
   Endpoints default to Cotality production and can be overridden with
   TRESTLE_TOKEN_URL / TRESTLE_ODATA_BASE_URL (e.g. a sandbox). */
import "server-only";

export const TRESTLE_TOKEN_URL =
  process.env.TRESTLE_TOKEN_URL || "https://api-trestle.corelogic.com/trestle/oidc/connect/token";

export const TRESTLE_ODATA_BASE_URL =
  process.env.TRESTLE_ODATA_BASE_URL || "https://api-trestle.corelogic.com/trestle/odata";

export function trestleCredentials(): { id: string; secret: string } | null {
  const id = process.env.TRESTLE_API_ID || process.env.TRESTLE_CLIENT_ID;
  const secret = process.env.TRESTLE_API_PASSWORD || process.env.TRESTLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}
