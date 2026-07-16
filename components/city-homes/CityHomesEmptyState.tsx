import Link from "next/link";

export interface NearbyCityCount {
  slug: string;
  name: string;
  count: number;
}

/* City-flavored zero state — points at same-county inventory instead of
   dead-ending, and always offers the metro-wide search. */
export default function CityHomesEmptyState({
  cityName,
  countyName,
  nearby,
}: {
  cityName: string;
  countyName: string;
  nearby: NearbyCityCount[];
}) {
  return (
    <div style={{ textAlign: "center", padding: "56px 12px 40px" }}>
      <div
        className="font-mono"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: "#C13E17" }}
      >
        NOTHING ON THE LEDGER
      </div>
      <div
        className="font-serif"
        style={{ fontStyle: "italic", fontSize: 21, color: "rgba(29,25,19,.7)", marginTop: 10 }}
      >
        No listings in {cityName} match — yet.
      </div>
      <p style={{ margin: "8px auto 0", maxWidth: 420, fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.65)" }}>
        Loosen a filter, save the search and we&rsquo;ll watch {cityName} for you — or look one town
        over in {countyName} County.
      </p>
      {nearby.length > 0 && (
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", marginTop: 18 }}>
          {nearby.map((n) => (
            <Link
              key={n.slug}
              href={`/city/${n.slug}/homes`}
              className="font-mono cp-city"
              style={{
                border: "1.5px solid #1D1913",
                borderRadius: 999,
                padding: "9px 15px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".12em",
                color: "#1D1913",
                textDecoration: "none",
                background: "#FBF7EE",
              }}
            >
              {n.name.toUpperCase()} · {n.count}
            </Link>
          ))}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <Link
          href="/homes"
          className="link-underline font-mono"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none" }}
        >
          BROWSE ALL OF DFW →
        </Link>
      </div>
    </div>
  );
}
