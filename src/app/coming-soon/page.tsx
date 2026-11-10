import type { Metadata } from "next";
import localFont from "next/font/local";
import Signup from "@/components/coming-soon/Signup";
import Motion from "@/components/coming-soon/Motion";
import { site, whatsappLink, displayPhone } from "@/lib/site";
import "./coming-soon.css";

export const revalidate = 300;

const outfit = localFont({
  src: "../fonts/Outfit-latin.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});

const title = "WellnessXpress | Coming soon";
export const metadata: Metadata = {
  title: "Coming soon",
  description: site.description,
  robots: { index: true, follow: false },
  openGraph: { title, description: site.description, url: site.url, siteName: site.name, images: [{ url: "/og.png", width: 1200, height: 630, alt: "WellnessXpress logo" }] },
  twitter: { card: "summary_large_image", title, description: site.description, images: ["/og.png"] },
};

const headline = [
  ["Your", 0], ["Journey", 1], ["to", 2], ["Better", 3, "hl"], ["Wellness", 4, "hl"], ["Starts", 5], ["Here.", 6],
] as const;

function Leaf({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 140" aria-hidden="true">
      <use href="#leaf" />
    </svg>
  );
}

export default function ComingSoon() {
  const wa = whatsappLink("Hello WellnessXpress, I would like to hear when you launch.");
  const phone = displayPhone(site.whatsapp);
  const org = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: site.url, logo: `${site.url}/brand/logo-1000.webp`, email: site.email || undefined };
  const srcset = (ext: string) => `/brand/logo-480.${ext} 480w, /brand/logo-720.${ext} 720w, /brand/logo-1000.${ext} 1000w`;
  const sizes = "(min-width: 1024px) 42vw, (min-width: 640px) 60vw, 86vw";

  return (
    <div className={`cs ${outfit.variable}`}>
      <svg width="0" height="0" className="sr-only" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#86cb07" />
            <stop offset="1" stopColor="#117006" />
          </linearGradient>
          <symbol id="leaf" viewBox="0 0 100 140">
            <path d="M50 2C92 34 96 92 50 138 4 92 8 34 50 2Z" fill="url(#lg)" />
            <path d="M50 20v112" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </symbol>
        </defs>
      </svg>

      <main id="main">
        <section className="hero" data-hero>
          <div className="hero-copy">
            <div className="green" aria-hidden="true">
              <i className="green-spin" />
              <i className="blob b1" />
              <i className="blob b2" />
              <i className="blob b3" />
            </div>
            <div className="copy-in">
              <p className="pill"><i aria-hidden="true" />Coming soon</p>
              <h1 className="h1">
                {headline.map(([w, i, cls]) => (
                  <span key={w}>
                    <span className="w">
                      <span className={cls === "hl" ? "hl" : undefined} style={{ ["--i" as string]: i }}>{w}</span>
                    </span>{" "}
                  </span>
                ))}
              </h1>
              <p className="lead">
                We&rsquo;re bringing you a better way to make wellness part of everyday life. Get ready for quality products, thoughtful choices and a healthier lifestyle.
              </p>
              <Signup />
              <div className="contacts">
                {wa && phone ? (
                  <a className="btn-ghost" href={wa} rel="noopener">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                    WhatsApp {phone}
                  </a>
                ) : null}
                {site.email ? (
                  <a className="mail" href={`mailto:${site.email}`}>{site.email}</a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="hero-visual" data-stage>
            <div className="layer d-bg">
              <svg className="rings" viewBox="0 0 600 600" aria-hidden="true">
                <circle className="ring r1" cx="300" cy="300" r="280" />
                <circle className="ring r2" cx="300" cy="300" r="235" />
              </svg>
            </div>
            <div className="layer d1"><div className="fl f1"><Leaf className="leaf lf1" /></div></div>
            <div className="layer d2"><div className="fl f2"><Leaf className="leaf lf2" /></div></div>
            <div className="layer d3"><div className="fl f3"><Leaf className="leaf lf3" /></div></div>
            <div className="layer d4"><div className="fl f4"><Leaf className="leaf lf4" /></div></div>
            <div className="layer d-logo">
              <div className="logo-wrap">
                <picture>
                  <source type="image/avif" srcSet={srcset("avif")} sizes={sizes} />
                  <source type="image/webp" srcSet={srcset("webp")} sizes={sizes} />
                  <img
                    className="logo"
                    src="/brand/logo-720.webp"
                    width={1241}
                    height={1115}
                    alt="WellnessXpress logo: a smiling woman in a green outfit inside a leaf-green ring, above the name WellnessXpress and the tagline Your Weightloss Journey Starts Here."
                    fetchPriority="high"
                    decoding="async"
                  />
                </picture>
              </div>
            </div>
            <div className="layer d5">
              <div className="badge" aria-hidden="true">
                <svg viewBox="0 0 120 120">
                  <defs><path id="circ" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" /></defs>
                  <circle cx="60" cy="60" r="58" fill="#86cb07" />
                  <g className="badge-spin">
                    <text textLength="272" lengthAdjust="spacing"><textPath href="#circ" startOffset="0" textLength="272" lengthAdjust="spacing">COMING SOON • COMING SOON • </textPath></text>
                  </g>
                  <use href="#leaf" x="42" y="38" width="36" height="50" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <div className="marquee" aria-hidden="true">
          <div className="track">
            {[0, 1].map((k) => (
              <ul key={k}>
                {["Quality products", "Thoughtful choices", "Healthier lifestyle", "Everyday wellness"].map((t) => (
                  <li key={t + k}>{t}<b /></li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <section className="expect" aria-labelledby="expect-h">
          <div className="wrap">
            <p className="kicker rv">What to expect</p>
            <h2 id="expect-h" className="h2 rv" style={{ ["--d" as string]: "80ms" }}>Wellness, made simple.</h2>
            <ul className="cards">
              {[
                ["01", "Quality products", "A focused range, chosen with care for everyday use."],
                ["02", "Thoughtful choices", "Clear information, so you can decide with confidence."],
                ["03", "A healthier lifestyle", "Simple steps that fit into your daily routine."],
              ].map(([n, t, d], i) => (
                <li key={n} className="card rv" style={{ ["--d" as string]: `${160 + i * 120}ms` }}>
                  <span className="num">{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="cta" aria-labelledby="cta-h">
          <i className="cb c1" aria-hidden="true" />
          <i className="cb c2" aria-hidden="true" />
          <div className="wrap cta-in">
            <h2 id="cta-h" className="h2 rv">Questions before we launch?</h2>
            <p className="rv" style={{ ["--d" as string]: "100ms" }}>Message us and the team will reply.</p>
            <div className="cta-btns rv" style={{ ["--d" as string]: "200ms" }}>
              {wa && phone ? <a className="btn-white" href={wa} rel="noopener">WhatsApp {phone}</a> : null}
              {site.email ? <a className="btn-line" href={`mailto:${site.email}`}>{site.email}</a> : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <div>
            <p className="foot-name">{site.name}</p>
            <p className="foot-line">Wellness and lifestyle, made part of everyday life.</p>
          </div>
          <div className="foot-links">
            {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}
            {wa && phone ? <a href={wa} rel="noopener">{phone}</a> : null}
          </div>
          <p className="foot-copy">&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
        </div>
      </footer>

      <Motion />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
    </div>
  );
}
