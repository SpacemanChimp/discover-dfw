import type { Metadata } from "next";
import { Playfair_Display, Archivo } from "next/font/google";
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
  title: "Discover DFW — A field guide to North Texas real estate",
  description:
    "A living atlas of Dallas–Fort Worth real estate — every city, every county, one clickable map.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
