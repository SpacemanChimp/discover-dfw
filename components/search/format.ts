/* Listing display helpers shared by server and client components — kept
   directive-free so server components can import them. */
import type { Listing } from "@/lib/mls/types";

export function badgeStyle(l: Listing): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  if (l.badge === "NEW")
    return { label: `NEW — ${l.daysOnMarket} DAYS`, bg: "#D9481F", fg: "#F6F1E6", border: "#D9481F" };
  if (l.badge.startsWith("OPEN"))
    return { label: l.badge, bg: "#FBF7EE", fg: "#1D1913", border: "#1D1913" };
  if (l.badge === "PRICE CUT")
    return { label: "PRICE CUT", bg: "#1D1913", fg: "#F6F1E6", border: "#1D1913" };
  return { label: `${l.daysOnMarket} DAYS`, bg: "#FBF7EE", fg: "#1D1913", border: "#1D1913" };
}

export const money = (n: number) => "$" + n.toLocaleString("en-US");
