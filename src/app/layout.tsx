import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Coming soon`, template: `%s | ${site.name}` },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: site.name, url: site.url, title: `${site.name} | Coming soon`, description: site.description, locale: "en_NG" },
  twitter: { card: "summary", title: `${site.name} | Coming soon`, description: site.description },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1c2b23" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
