"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Logo";

const LINKS = [
  { id: "map", label: "THE MAP" },
  { id: "new-builds", label: "NEW BUILDS" },
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
    LINKS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <nav
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
      <div
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
        {LINKS.map(({ id, label }) => (
          <Link
            key={id}
            href={`/#${id}`}
            className="nav-link"
            style={{
              color: "#1D1913",
              textDecoration: "none",
              padding: "6px 2px",
              borderBottom:
                navSec === id
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
