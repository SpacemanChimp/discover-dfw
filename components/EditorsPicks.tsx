import Link from "next/link";
import { bySlug, countyById, fmtK, cities } from "@/lib/dfw-data";
import { getApprovedPhotos, photoKey } from "@/lib/content/editorial-photos";
import EditorialPhoto from "@/components/EditorialPhoto";

/* Chat's final intent: "Start with these four" = Denton → Fort Worth → Dallas → Frisco */
const PICKS: { slug: string; photo: string }[] = [
  { slug: "denton", photo: "THE COURTHOUSE SQUARE" },
  { slug: "fort-worth", photo: "THE STOCKYARDS" },
  { slug: "dallas", photo: "THE SKYLINE" },
  { slug: "frisco", photo: "THE STAR DISTRICT" },
];
const PHOTO_LABELS = new Map(PICKS.map((p) => [p.slug, p.photo]));

export default async function EditorsPicks({
  introOverride,
  regionKey,
  lineup,
  bb,
}: {
  introOverride?: React.ReactNode;
  regionKey?: string;
  /** Visual Builder override: four {city, tagline?} cards. Absent = the
      code lineup above. City name/county/median/URL stay canonical data. */
  lineup?: { city: string; tagline?: string }[];
  /** builder-canvas render: cards gain data-bb-card markers (never public) */
  bb?: boolean;
} = {}) {
  const resolved: { city: string; tagline?: string }[] = (lineup?.length === 4 ? lineup : PICKS.map((p) => ({ city: p.slug }))).filter(
    (p) => bySlug[p.city]
  );
  /* builder-canvas renders go through renderToStaticMarkup, where next/link
     is an uninvokable client reference — a plain <a> renders the IDENTICAL
     DOM (Link outputs <a href>) and the canvas blocks navigation anyway */
  const A: React.ElementType = bb ? "a" : Link;
  /* CI-3: one query covers all four picks (composite entity_slug::slot_key
     keys — every pick shares slot_key='pick'). Empty = placeholders. */
  const photos = await getApprovedPhotos(
    "homepage",
    resolved.map((p) => p.city)
  );
  return (
    <section style={{ maxWidth: 1380, margin: "0 auto", padding: "60px 4vw 90px" }}>
      <div
        data-reveal="1"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 34,
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".32em",
              color: "#D9481F",
              marginBottom: 14,
            }}
          >
            02 — EDITOR&apos;S PICKS
          </div>
          <h2
            className="font-serif"
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: "clamp(34px,4.2vw,56px)",
              lineHeight: 1.02,
            }}
          >
            Start with these four.
          </h2>
        </div>
        <A
          href="#cities"
          className="link-underline"
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: ".12em",
            color: "#1D1913",
            textDecoration: "none",
            borderBottom: "2px solid #D9481F",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          SEE ALL {cities.length} →
        </A>
      </div>

      {/* EDITOR-desk intro — this section has no code intro, so the region
          renders nothing until an override is published (additive only) */}
      {introOverride && (
        <div data-reveal="1" data-bb-region={regionKey} style={{ maxWidth: 680, margin: "0 0 26px", fontSize: 15.5, lineHeight: 1.7, color: "rgba(29,25,19,.75)" }}>
          {introOverride}
        </div>
      )}

      <div
        data-reveal="1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(255px,1fr))",
          gap: 20,
        }}
      >
        {resolved.map(({ city: slug, tagline }, i) => {
          const c = bySlug[slug];
          const county = countyById[c.county];
          const photo = PHOTO_LABELS.get(slug) ?? c.name.toUpperCase();
          const approved = photos.get(photoKey(slug, "pick"));
          return (
            <A
              key={slug}
              href={`/city/${slug}`}
              className="pick-card"
              data-bb-card={bb ? i : undefined}
              data-bb-card-city={bb ? slug : undefined}
              data-bb-card-label={bb ? `PICK ${i + 1} — ${c.name.toUpperCase()}` : undefined}
              style={{
                textDecoration: "none",
                color: "#1D1913",
                border: "2px solid #1D1913",
                borderRadius: 18,
                overflow: "hidden",
                background: "#FBF7EE",
                display: "block",
              }}
            >
              <EditorialPhoto
                photo={approved}
                attributionLink={false} /* inside the card's <Link> — nested anchors are invalid HTML */
                style={{
                  aspectRatio: "4 / 2.9",
                  position: "relative",
                  background:
                    "repeating-linear-gradient(-45deg,#EFE7D6 0 12px,#E8DEC9 12px 24px)",
                  borderBottom: "2px solid #1D1913",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                overlay={
                  <span
                    className="font-mono"
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      fontSize: 9.5,
                      letterSpacing: ".2em",
                      background: "#1D1913",
                      color: "#F6F1E6",
                      padding: "5px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {county.name.toUpperCase()} CO.
                  </span>
                }
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: ".16em",
                    color: "rgba(29,25,19,.55)",
                    background: "rgba(246,241,230,.85)",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px dashed rgba(29,25,19,.35)",
                    textAlign: "center" as const,
                  }}
                >
                  PHOTO — {photo}
                  {bb && !approved && (
                    /* builder-canvas only: an honest editor-facing state — a
                       lineup with this card can DRAFT but never PUBLISH */
                    <span style={{ display: "block", marginTop: 6, color: "#C13E17", fontWeight: 700 }}>
                      NO APPROVED HOMEPAGE PHOTO — USE CHANGE PHOTO
                    </span>
                  )}
                </span>
              </EditorialPhoto>
              <div style={{ padding: "20px 22px 22px" }}>
                <div
                  className="font-serif"
                  style={{ fontWeight: 900, fontSize: 29, lineHeight: 1 }}
                >
                  {c.name}
                </div>
                <div
                  className="font-serif"
                  style={{
                    fontStyle: "italic",
                    fontSize: 14.5,
                    color: "rgba(29,25,19,.65)",
                    marginTop: 6,
                  }}
                >
                  {tagline || c.tagline}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: 16,
                    borderTop: "1px solid rgba(29,25,19,.16)",
                    paddingTop: 13,
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: 12.5, color: "#D9481F", fontWeight: 700 }}
                  >
                    {fmtK(c.price)} MEDIAN
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".08em" }}>
                    EXPLORE →
                  </span>
                </div>
              </div>
            </A>
          );
        })}
      </div>
    </section>
  );
}
