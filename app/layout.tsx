import type { Metadata } from "next";
import Script from "next/script";
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
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-K55FN2BN');`}
      </Script>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-K55FN2BN"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <ShelfProvider>
          {children}
          <ShelfOverlays />
        </ShelfProvider>
      </body>
    </html>
  );
}
