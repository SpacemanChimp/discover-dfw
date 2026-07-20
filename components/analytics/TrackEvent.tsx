"use client";
/* Mount beacon — lets SERVER components emit a first-party event when a
   surface actually renders in a browser. Renders nothing; fires once per
   page life (strict-mode safe via track()'s onceKey); never blocks. */
import { useEffect } from "react";
import { track, type TrackContext } from "@/lib/analytics/track";

export default function TrackEvent({ event, ctx }: { event: string; ctx?: TrackContext }) {
  useEffect(() => {
    track(event, ctx ?? {}, `${event}:${window.location.pathname}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
