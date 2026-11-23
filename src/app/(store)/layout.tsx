import localFont from "next/font/local";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Analytics from "@/components/Analytics";
import { CartProvider } from "@/components/CartProvider";
import { StorePixel } from "@/components/pixel";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { getContact } from "@/lib/settings";
import { site } from "@/lib/site";
import type { Metadata } from "next";
import { getSeo } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Store-wide SEO defaults from the SEO dashboard. Pages override title, description and image where they have their own. */
export function generateMetadata(): Metadata {
  const seo = getSeo();
  const template = seo.titleTemplate?.includes("%s") ? seo.titleTemplate : `%s | ${site.name}`;
  const image = seo.ogImage || "/og.jpg";
  return {
    title: { default: seo.homeTitle || site.name, template },
    description: seo.defaultDescription || site.description,
    openGraph: { type: "website", siteName: site.name, url: site.url, locale: "en_NG", description: seo.defaultDescription || site.description, images: [{ url: image, alt: site.name }] },
    twitter: { card: "summary_large_image", images: [image] },
    robots: seo.noindexSite ? { index: false, follow: false } : undefined,
  };
}

const outfit = localFont({ src: "../fonts/Outfit-latin.woff2", variable: "--font-outfit", display: "swap", weight: "300 800" });

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const c = getContact();
  const org = {
    "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, logo: `${site.url}/brand/logo-1000.webp`,
    slogan: site.tagline, email: c.email || undefined,
    contactPoint: c.whatsapp ? [{ "@type": "ContactPoint", telephone: "+" + c.whatsapp, contactType: "customer service", areaServed: "NG" }] : undefined,
  };
  return (
    <div id="store-root" className={`${outfit.variable} font-sans`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3 focus:shadow">Skip to content</a>
      <CartProvider>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <FloatingWhatsApp whatsapp={c.whatsapp} />
      </CartProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org).replace(/</g, "\\u003c") }} />
      <Analytics />
      <StorePixel />
    </div>
  );
}
