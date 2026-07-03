import Link from "next/link";
import { CSSProperties } from "react";

/** The DISC⊙VER DFW wordmark with the location-pin "O". */
export function PinSvg({
  style,
  holeFill = "#F6F1E6",
}: {
  style?: CSSProperties;
  holeFill?: string;
}) {
  return (
    <svg viewBox="0 0 100 132" style={style} aria-hidden="true">
      <path
        d="M50 4 C25 4 5 24 5 49 c0 33 45 79 45 79 s45 -46 45 -79 C95 24 75 4 50 4 Z"
        fill="#D9481F"
      />
      <circle cx="50" cy="47" r="16" fill={holeFill} />
    </svg>
  );
}

export function Wordmark({
  href = "/",
  fontSize = 21,
  color = "#1D1913",
  holeFill = "#F6F1E6",
  className,
}: {
  href?: string;
  fontSize?: number;
  color?: string;
  holeFill?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`font-serif ${className ?? ""}`}
      style={{
        textDecoration: "none",
        color,
        fontWeight: 900,
        fontSize,
        letterSpacing: ".01em",
        display: "inline-flex",
        alignItems: "baseline",
        whiteSpace: "nowrap",
      }}
    >
      DISC
      <PinSvg
        style={{
          height: ".72em",
          width: "auto",
          transform: "translateY(.05em)",
          margin: "0 1px",
        }}
        holeFill={holeFill}
      />
      VER&nbsp;DFW
    </Link>
  );
}
