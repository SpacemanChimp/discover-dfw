"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Logo";

export default function CityNav({
  slug,
  options,
  prevSlug,
  nextSlug,
}: {
  slug: string;
  options: { slug: string; name: string }[];
  prevSlug: string;
  nextSlug: string;
}) {
  const router = useRouter();
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        padding: "13px 4vw",
        background: "rgba(246,241,230,.92)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(29,25,19,.16)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22, minWidth: 0 }}>
        <Wordmark href="/" fontSize={19} />
        <Link
          href="/#map"
          className="city-back font-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: ".18em",
            color: "rgba(29,25,19,.6)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ← BACK TO THE MAP
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <select
          value={slug}
          onChange={(e) => router.push(`/city/${e.target.value}`)}
          style={{
            fontFamily: "var(--font-archivo),sans-serif",
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: ".06em",
            padding: "9px 14px",
            borderRadius: 999,
            border: "2px solid #1D1913",
            background: "#F6F1E6",
            color: "#1D1913",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name}
            </option>
          ))}
        </select>
        <Link href={`/city/${prevSlug}`} title="Previous city" className="city-arrow" style={arrow}>
          ←
        </Link>
        <Link href={`/city/${nextSlug}`} title="Next city" className="city-arrow" style={arrow}>
          →
        </Link>
      </div>
    </nav>
  );
}

const arrow: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "2px solid #1D1913",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#1D1913",
  textDecoration: "none",
  fontSize: 16,
  background: "#F6F1E6",
};
