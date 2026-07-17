"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Logo";

/* On-page section anchors (scroll-spy) plus one real page link (LAND → /land).
   `href` entries route to their own page and are skipped by the observer. */
const LINKS: { id: string; label: string; href?: string }[] = [
  { id: "map", label: "THE MAP" },
  { id: "new-builds", label: "NEW BUILDS" },
  { id: "land", label: "LAND", href: "/land" },
  { id: "cities", label: "THE INDEX" },
  { id: "about", label: "ABOUT" },
];

export default function Nav() {
  const [navSec, setNavSec] = useState("");

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setNavSec(e.target.id);
        });
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    LINKS.forEach(({ id, href }) => {
      if (href) return; // real page link, not an on-page section
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <nav
      className="site-nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "14px 4vw",
        background: "rgba(246,241,230,.9)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(29,25,19,.16)",
      }}
    >
      <Wordmark href="/#top" fontSize={21} />

      {/* desktop links — hidden ≤940px in favor of the scroll strip */}
      <div
        className="site-nav-desktop"
        style={{
          display: "flex",
          gap: 26,
          alignItems: "center",
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: ".16em",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {LINKS.map(({ id, label, href }) => (
          <Link
            key={id}
            href={href ?? `/#${id}`}
            className="nav-link"
            style={{
              color: "#1D1913",
              textDecoration: "none",
              padding: "6px 2px",
              borderBottom:
                !href && navSec === id
                  ? "2px solid #D9481F"
                  : "2px solid transparent",
            }}
          >
            {label}
          </Link>
        ))}
        <Link
          href="/homes"
          className="nav-link"
          style={{
            color: "#D9481F",
            textDecoration: "none",
            padding: "6px 2px",
            borderBottom: "2px solid transparent",
            fontWeight: 700,
          }}
        >
          SEARCH HOMES
        </Link>
      </div>

      {/* mobile: one short row — wordmark + horizontally scrolling chips;
          no vertical stacking, header stays ~56px (globals.css .site-nav-*) */}
      <div className="site-nav-mobile font-mono" aria-label="Site sections">
        <Link href="/homes" style={{ ...chip, color: "#F6F1E6", background: "#D9481F", borderColor: "#D9481F" }}>
          SEARCH
        </Link>
        {LINKS.map(({ id, label, href }) => (
          <Link key={id} href={href ?? `/#${id}`} style={chip}>
            {label}
          </Link>
        ))}
        <Link href="/#newsletter" style={{ ...chip, color: "#F6F1E6", background: "#1D1913", borderColor: "#1D1913" }}>
          THE LETTER
        </Link>
      </div>

      <Link
        href="/#newsletter"
        className="btn-letter"
        style={{
          background: "#1D1913",
          color: "#F6F1E6",
          textDecoration: "none",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: ".14em",
          padding: "11px 22px",
          borderRadius: 999,
          border: "2px solid #1D1913",
          whiteSpace: "nowrap",
        }}
      >
        GET THE LETTER
      </Link>
    </nav>
  );
}

const chip: React.CSSProperties = {
  color: "#1D1913",
  textDecoration: "none",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: ".12em",
  padding: "7px 13px",
  borderRadius: 999,
  border: "1.5px solid rgba(29,25,19,.45)",
  whiteSpace: "nowrap",
};
