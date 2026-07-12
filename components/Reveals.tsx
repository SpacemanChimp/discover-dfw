"use client";
import { useEffect } from "react";

/** Ports the prototype's reveal-on-scroll: elements with [data-reveal] that
 *  start below 92% of the viewport fade + rise in as they enter view. */
export default function Reveals() {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]")
    );
    const vh = window.innerHeight;
    const below = els.filter(
      (el) => el.getBoundingClientRect().top > vh * 0.92
    );
    below.forEach((el) => el.classList.add("reveal-hidden"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.classList.remove("reveal-hidden");
            el.classList.add("reveal-in");
            io.unobserve(el);
          }
        });
      },
      /* threshold 0 + a bottom rootMargin, NOT a ratio threshold: a ratio can
         never be reached by elements taller than ~10x the viewport (the
         homepage new-build grid is ~8,500px on phones — at threshold 0.1 it
         stayed reveal-hidden forever). First pixel crossing 92% of the
         viewport reveals, matching the original design intent. */
      { threshold: 0, rootMargin: "0px 0px -8% 0px" }
    );
    below.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
