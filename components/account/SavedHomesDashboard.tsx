"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Listing, SavedHome } from "@/lib/mls/types";
import { bySlug, fmtK } from "@/lib/dfw-data";
import { useShelf } from "@/lib/shelf";
import SavedListingCardBroadsheet from "./SavedListingCardBroadsheet";
import SavedHomesEmptyState from "./SavedHomesEmptyState";

interface ShelfEntry {
  rec: SavedHome;
  listing: Listing | null;
}

/* "Your shelf." — saved homes grouped by city, newest saves first, with
   off-market saves surfaced as NO LONGER AVAILABLE instead of vanishing.
   Driven by the saved KEYS (not the inventory), so the counts always match
   the nav pill. Two sources: `allListings` (mock pool, passed from the page)
   or `live` (keys resolve through /api/shelf-listings against the real feed).
   Guest localStorage + the DB-backed shelf both merge in via useShelf. */
export default function SavedHomesDashboard({
  allListings,
  live = false,
}: {
  allListings?: Listing[];
  live?: boolean;
}) {
  const shelf = useShelf();
  const total = shelf.savedCount;

  // live mode: once the shelf is ready, hydrate the saved keys from the feed.
  // null = fetch not settled yet; error degrades to a quiet retry line, never
  // a false "no longer available".
  const [liveListings, setLiveListings] = useState<Listing[] | null>(null);
  const [liveError, setLiveError] = useState(false);
  useEffect(() => {
    if (!live || !shelf.ready) return;
    const keys = Object.values(shelf.saved)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .slice(0, 60)
      .map((r) => r.listingKey);
    if (keys.length === 0) {
      setLiveListings((prev) => prev ?? []);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/shelf-listings?keys=${encodeURIComponent(keys.join(","))}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`shelf-listings ${r.status}`))))
      .then((data: { listings?: Listing[] }) => {
        setLiveListings(data.listings ?? []);
        setLiveError(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setLiveListings([]);
        setLiveError(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, shelf.ready]);

  const source = live ? liveListings ?? [] : allListings ?? [];
  const byKey = new Map(source.map((l) => [l.listingKey, l]));

  // skeletons until the shelf loads and (live mode) the feed lookup lands
  const loading = !shelf.ready || (live && total > 0 && liveListings === null);

  const entries: ShelfEntry[] = shelf.ready
    ? Object.values(shelf.saved)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((rec) => ({ rec, listing: byKey.get(rec.listingKey) ?? null }))
    : [];

  // group by city; saves whose listing left the feed pool at the end
  const groups: { citySlug: string | null; items: ShelfEntry[] }[] = [];
  for (const e of entries) {
    const slug = e.listing?.citySlug ?? null;
    const g = groups.find((x) => x.citySlug === slug);
    if (g) g.items.push(e);
    else groups.push({ citySlug: slug, items: [e] });
  }
  groups.sort((a, b) => (a.citySlug === null ? 1 : 0) - (b.citySlug === null ? 1 : 0));

  // After the badges render, record what was just observed so next visit's
  // "since you last looked" comparisons start from today (account mode only).
  const seenSynced = useRef(false);
  useEffect(() => {
    if (!shelf.ready || !shelf.account || seenSynced.current) return;
    if (live && total > 0 && liveListings === null) return; // wait for the hydrate
    seenSynced.current = true;
    const seen = entries
      .filter(
        (e) =>
          e.listing &&
          (e.rec.lastSeenPrice !== e.listing.listPrice ||
            e.rec.lastSeenStatus !== e.listing.standardStatus)
      )
      .map((e) => ({
        listingKey: e.rec.listingKey,
        price: e.listing!.listPrice,
        status: e.listing!.standardStatus,
      }));
    if (seen.length) {
      fetch("/api/saved-listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf.ready, shelf.account, liveListings]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 4vw 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(30px,5vw,40px)" }}>
          Your shelf.
        </h1>
        <span
          className="font-mono"
          style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.62)", display: "inline-flex", gap: 12, alignItems: "baseline" }}
        >
          {shelf.account ? `SYNCED ✓ · ${shelf.account.email.toUpperCase()}` : "GUEST SHELF"}
          {shelf.account && shelf.authMode === "supabase" && (
            <button
              type="button"
              onClick={shelf.signOut}
              style={{ font: "inherit", letterSpacing: "inherit", color: "#C13E17", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: "12px 8px" }}
            >
              SIGN OUT
            </button>
          )}
        </span>
      </div>

      {/* tabs pill */}
      <div style={{ display: "flex", border: "2px solid #1D1913", borderRadius: 999, marginTop: 16, overflow: "hidden" }}>
        <span
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", background: "#1D1913", color: "#F6F1E6" }}
        >
          {shelf.ready ? total : "—"} {total === 1 ? "HOME" : "HOMES"}
        </span>
        <Link
          href="/account/saved-searches"
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 9.5, letterSpacing: ".14em", color: "#1D1913", textDecoration: "none" }}
        >
          {shelf.ready ? shelf.searches.length : "—"} {shelf.searches.length === 1 ? "SEARCH" : "SEARCHES"}
        </Link>
      </div>

      {/* guest banner */}
      {shelf.ready && !shelf.account && total > 0 && (
        <div
          style={{
            margin: "14px 0 0",
            border: "2px dashed rgba(217,72,31,.6)",
            borderRadius: 12,
            padding: "11px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(217,72,31,.06)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 13 }}>⚑</span>
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: "rgba(29,25,19,.75)" }}>
            Guest shelf — lives on this device only.
          </span>
          <button
            type="button"
            onClick={shelf.openAuth}
            className="font-mono"
            style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".12em", color: "#C13E17", background: "none", border: "none", cursor: "pointer", padding: "12px 8px" }}
          >
            CREATE ACCOUNT →
          </button>
        </div>
      )}

      {loading ? (
        <BroadsheetSkeleton />
      ) : liveError ? (
        <div
          className="font-mono"
          style={{
            border: "2px dashed rgba(29,25,19,.35)",
            borderRadius: 14,
            padding: "22px 14px",
            textAlign: "center",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".16em",
            color: "rgba(29,25,19,.62)",
            marginTop: 24,
          }}
        >
          SHELF LOOKUP FAILED — TRY A REFRESH
        </div>
      ) : total === 0 ? (
        <SavedHomesEmptyState />
      ) : (
        groups.map((g) => {
          const c = g.citySlug ? bySlug[g.citySlug] : undefined;
          return (
            <section key={g.citySlug ?? "off-market"} style={{ marginTop: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  borderBottom: "2px solid #1D1913",
                  paddingBottom: 7,
                }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: ".2em",
                    color: g.citySlug ? "#C13E17" : "rgba(29,25,19,.62)",
                  }}
                >
                  {g.citySlug
                    ? `${(c?.name || g.citySlug).toUpperCase()} — ${g.items.length} ${g.items.length === 1 ? "HOME" : "HOMES"}`
                    : `OFF THE MARKET — ${g.items.length}`}
                </span>
                {c && (
                  <Link
                    href={`/city/${c.slug}`}
                    className="font-mono link-underline"
                    style={{ fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.62)", textDecoration: "none" }}
                  >
                    CITY MEDIAN {fmtK(c.price)} · REPORT →
                  </Link>
                )}
              </div>
              {g.items.map((e) => (
                <SavedListingCardBroadsheet key={e.rec.listingKey} rec={e.rec} listing={e.listing} />
              ))}
            </section>
          );
        })
      )}

      {!loading && total >= 2 && (
        <div
          className="font-mono"
          style={{
            border: "2px dashed rgba(29,25,19,.35)",
            borderRadius: 999,
            padding: "12px 0",
            textAlign: "center",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".16em",
            color: "rgba(29,25,19,.62)",
            marginTop: 20,
          }}
        >
          ⇄ COMPARE VIEW — COMING WITH ACCOUNTS
        </div>
      )}
    </div>
  );
}

/* Broadsheet-shaped placeholder while the shelf loads — same row silhouette
   as SavedListingCardBroadsheet so the swap doesn't jump. */
function BroadsheetSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading saved homes">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rail-skeleton-card"
          style={{
            display: "flex",
            border: "2px solid #1D1913",
            borderRadius: 14,
            background: "#FBF7EE",
            overflow: "hidden",
            marginTop: i === 0 ? 24 : 12,
          }}
        >
          <div
            style={{
              width: 112,
              flexShrink: 0,
              minHeight: 98,
              background: "repeating-linear-gradient(45deg,#EFE7D6 0 12px,#E7DDC7 12px 24px)",
            }}
          />
          <div style={{ flex: 1, padding: "14px 13px", borderLeft: "2px solid #1D1913" }}>
            <div style={{ height: 18, width: "34%", borderRadius: 6, background: "rgba(29,25,19,.1)" }} />
            <div style={{ height: 12, width: "62%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 9 }} />
            <div style={{ height: 10, width: "48%", borderRadius: 6, background: "rgba(29,25,19,.08)", marginTop: 7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
