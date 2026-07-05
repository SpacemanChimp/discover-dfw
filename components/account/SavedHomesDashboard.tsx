"use client";
import { useEffect, useRef } from "react";
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
   the nav pill. Phase 6 scope: guest localStorage only — the DB-backed
   shelf merges in with real accounts. */
export default function SavedHomesDashboard({ allListings }: { allListings: Listing[] }) {
  const shelf = useShelf();
  const byKey = new Map(allListings.map((l) => [l.listingKey, l]));

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

  const total = shelf.savedCount;

  // After the badges render, record what was just observed so next visit's
  // "since you last looked" comparisons start from today (account mode only).
  const seenSynced = useRef(false);
  useEffect(() => {
    if (!shelf.ready || !shelf.account || seenSynced.current) return;
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
  }, [shelf.ready, shelf.account]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 4vw 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="font-serif" style={{ margin: 0, fontWeight: 900, fontSize: "clamp(30px,5vw,40px)" }}>
          Your shelf.
        </h1>
        <span
          className="font-mono"
          style={{ fontSize: 8.5, letterSpacing: ".16em", color: "rgba(29,25,19,.5)", display: "inline-flex", gap: 12, alignItems: "baseline" }}
        >
          {shelf.account ? `SYNCED ✓ · ${shelf.account.email.toUpperCase()}` : "GUEST SHELF"}
          {shelf.account && shelf.authMode === "supabase" && (
            <button
              type="button"
              onClick={shelf.signOut}
              style={{ font: "inherit", letterSpacing: "inherit", color: "#D9481F", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
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
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em", background: "#1D1913", color: "#F6F1E6" }}
        >
          {total} {total === 1 ? "HOME" : "HOMES"}
        </span>
        <Link
          href="/account/saved-searches"
          className="font-mono"
          style={{ flex: 1, textAlign: "center", padding: "12px 0", fontSize: 9.5, letterSpacing: ".14em", color: "#1D1913", textDecoration: "none" }}
        >
          {shelf.searches.length} {shelf.searches.length === 1 ? "SEARCH" : "SEARCHES"}
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
          <span style={{ fontSize: 13 }}>⚑</span>
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45, color: "rgba(29,25,19,.75)" }}>
            Guest shelf — lives on this device only.
          </span>
          <button
            type="button"
            onClick={shelf.openAuth}
            className="font-mono"
            style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".12em", color: "#D9481F", background: "none", border: "none", cursor: "pointer" }}
          >
            CREATE ACCOUNT →
          </button>
        </div>
      )}

      {shelf.ready && total === 0 ? (
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
                    color: g.citySlug ? "#D9481F" : "rgba(29,25,19,.55)",
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
                    style={{ fontSize: 8.5, letterSpacing: ".12em", color: "rgba(29,25,19,.5)", textDecoration: "none" }}
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

      {total >= 2 && (
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
            color: "rgba(29,25,19,.5)",
            marginTop: 20,
          }}
        >
          ⇄ COMPARE VIEW — COMING WITH ACCOUNTS
        </div>
      )}
    </div>
  );
}
