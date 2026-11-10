import type { Metadata } from "next";
import Signup from "@/components/coming-soon/Signup";
import Art from "@/components/coming-soon/Art";
import Mark from "@/components/coming-soon/Mark";
import { site, whatsappLink, displayPhone } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Coming soon",
  description: site.description,
  robots: { index: true, follow: false },
};

export default function ComingSoon() {
  const wa = whatsappLink("Hello WellnessXpress, I would like to hear when you launch.");
  const phone = displayPhone(site.whatsapp);
  const org = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, email: site.email || undefined };
  return (
    <div className="cs-page">
      <header className="cs-head">
        <a href="/" className="cs-brand">
          <Mark size={38} />
          <span>WellnessXpress</span>
        </a>
        <span className="cs-pill">Coming soon</span>
      </header>

      <main id="main" className="cs-main">
        <section className="cs-copy">
          <p className="cs-eyebrow">Launching soon</p>
          <h1 className="cs-h1">Something Better for Your Everyday Wellness.</h1>
          <p className="cs-lead">
            We are preparing a better way to make wellness part of your everyday life. Quality products, thoughtful choices and a healthier lifestyle are coming soon.
          </p>
          <Signup />
          <div className="cs-contact">
            {wa && phone ? (
              <a className="cs-link" href={wa} rel="noopener">
                WhatsApp {phone}
              </a>
            ) : null}
            {site.email ? (
              <a className="cs-link" href={`mailto:${site.email}`}>
                {site.email}
              </a>
            ) : null}
          </div>
        </section>
        <div className="cs-visual" aria-hidden={false}>
          <Art />
        </div>
      </main>

      <ul className="cs-values">
        <li>Quality products</li>
        <li>Thoughtful choices</li>
        <li>Everyday wellness</li>
      </ul>

      <footer className="cs-foot">
        <div>
          <p className="cs-foot-name">{site.name}</p>
          <p>Wellness and lifestyle, made part of everyday life.</p>
        </div>
        <div className="cs-foot-links">
          {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}
          {wa && phone ? <a href={wa} rel="noopener">{phone}</a> : null}
        </div>
        <p className="cs-copy-r">&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
    </div>
  );
}
