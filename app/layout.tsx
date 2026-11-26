import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, url: site.url, title: site.name, description: site.description, locale: "en_NG", images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "WellnessXpress products" }] },
  twitter: { card: "summary_large_image", title: site.name, description: site.description, images: ["/og.jpg"] },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#074606" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
