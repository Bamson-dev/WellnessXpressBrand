import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Analytics from "@/components/Analytics";
import { CartProvider } from "@/components/CartProvider";
import { site } from "@/lib/site";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const org = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url };
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">Skip to content</a>
      <CartProvider>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </CartProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <Analytics />
    </>
  );
}
