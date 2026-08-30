import type { Metadata } from "next";
import { Playfair_Display, Archivo } from "next/font/google";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { ShelfProvider } from "@/lib/shelf";
import ShelfOverlays from "@/components/search/ShelfOverlays";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Discover DFW — A field guide to North Texas real estate",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "A living atlas of Dallas–Fort Worth real estate — every city, every county, one clickable map.",
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  // app/opengraph-image.tsx + twitter-image.tsx supply the branded default
  // card image site-wide; per-route files override it (city/hood/feature)
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  // Google Search Console HTML-tag ownership verification — env-driven,
  // never hardcoded; omitted entirely when the variable is absent
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${archivo.variable}`}>
      <body>
        <ShelfProvider>
          {children}
          <ShelfOverlays />
        </ShelfProvider>
      </body>
    </html>
  );
}
