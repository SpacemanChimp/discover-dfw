import type { ListingSchools } from "@/lib/mls/types";

/* "03 — SCHOOLS" — ONLY what the MLS listing record reports (RESO school
   fields). Launch-safe rules: never inferred from city/hood, no A-F ratings
   here (no high-confidence campus match against TEA yet), always the
   verify-with-the-district line, and an explicit "not reported" note when
   the record carries no school fields (typically commercial/land). Hidden
   entirely off the live feed — mock records are fiction. */
export default function ListingSchoolsCard({
  schools,
  live,
}: {
  schools: ListingSchools | null;
  live: boolean;
}) {
  if (!live) return null;

  const rows = schools
    ? ([
        ["ELEMENTARY", schools.elementary],
        ["MIDDLE", schools.middleOrJunior],
        ["HIGH", schools.high],
      ] as const).filter((r) => r[1])
    : [];

  const districts = [...new Set(rows.map(([, s]) => s!.district).filter(Boolean))];
  const oneDistrict = districts.length === 1 ? districts[0] : null;

  return (
    <>
      <div
        className="font-mono"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".26em", color: "#C13E17", marginTop: 26 }}
      >
        03 — SCHOOLS
      </div>
      <div
        style={{ border: "2px solid #1D1913", borderRadius: 14, background: "#FBF7EE", padding: "16px 18px", marginTop: 10 }}
      >
        <div className="font-serif" style={{ fontWeight: 800, fontSize: 20 }}>
          Schools reported for this listing
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.65, color: "rgba(29,25,19,.72)" }}>
          School information comes from the MLS listing record. Verify current
          assignments with the district before relying on them.
        </p>
        {rows.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {rows.map(([label, s], i) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 14,
                  padding: "10px 0",
                  borderBottom: i < rows.length - 1 || oneDistrict ? "1px solid rgba(29,25,19,.16)" : undefined,
                }}
              >
                <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
                  {label}
                </span>
                <span className="font-serif" style={{ fontWeight: 700, fontSize: 16, textAlign: "right" }}>
                  {s!.name}
                  {!oneDistrict && s!.district ? (
                    <span className="font-mono" style={{ fontWeight: 400, fontSize: 9.5, letterSpacing: ".12em", color: "rgba(29,25,19,.55)" }}>
                      {" "}
                      · {s!.district.toUpperCase()}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
            {oneDistrict && (
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, padding: "10px 0" }}
              >
                <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
                  DISTRICT
                </span>
                <span className="font-serif" style={{ fontWeight: 700, fontSize: 16 }}>{oneDistrict}</span>
              </div>
            )}
            <div className="font-mono" style={{ marginTop: 8, fontSize: 8.5, letterSpacing: ".14em", color: "rgba(29,25,19,.5)" }}>
              AS REPORTED ON THE MLS RECORD — NOT A BOUNDARY DETERMINATION
            </div>
          </div>
        ) : (
          <div className="font-mono" style={{ marginTop: 12, fontSize: 9.5, letterSpacing: ".14em", color: "rgba(29,25,19,.55)" }}>
            SCHOOL INFORMATION NOT REPORTED ON THIS LISTING.
          </div>
        )}
      </div>
    </>
  );
}
