"use client";

/* Anonymous session id for lead analytics — lets lead_events tie a guest's
   actions together without an account. Not auth, not tracking across
   sites; just a random id in this browser's localStorage. */

const KEY = "ddfw.sid.v1";

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let sid = window.localStorage.getItem(KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      window.localStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return null; // storage blocked — leads still submit, just unlinked
  }
}
