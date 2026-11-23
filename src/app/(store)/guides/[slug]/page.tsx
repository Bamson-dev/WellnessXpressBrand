import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, publishedGuides } from "@/lib/guides";
import { getProduct, priceRange } from "@/lib/catalog";
import GuideBody, { guideHeadings } from "@/components/GuideBody";
import { naira, site } from "@/lib/site";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await props.params).slug);
  if (!g) return { title: "Guide not found", robots: { index: false } };
  return {
    title: g.title, description: g.description, alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, url: `${site.url}/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated },
  };
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function GuidePage(props: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await props.params).slug);
  if (!g) notFound();
  const url = `${site.url}/guides/${g.slug}`;
  const products = g.products.map((s) => getProduct(s)).filter((p): p is NonNullable<typeof p> => !!p && !p.noindex);
  const related = publishedGuides().filter((x) => x.slug !== g.slug && (x.cluster === g.cluster || x.products.some((p) => g.products.includes(p)))).slice(0, 3);
  const toc = guideHeadings(g.body);
  const article = {
    "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, url, mainEntityOfPage: url,
    datePublished: g.published, dateModified: g.updated, inLanguage: "en-NG",
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@type": "Organization", name: site.name, url: site.url, logo: { "@type": "ImageObject", url: `${site.url}/brand/logo-1000.webp` } },
    image: [`${site.url}/og.jpg`],
    citation: g.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })),
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: site.url },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${site.url}/guides` },
    { "@type": "ListItem", position: 3, name: g.title, item: url },
  ] };
  return (
    <article className="container-x py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-600"><Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">/</span> <Link href="/guides" className="hover:underline">Guides</Link></nav>
      <div className="mx-auto mt-4 max-w-3xl">
        <h1 className="text-3xl leading-tight sm:text-4xl">{g.title}</h1>
        <p className="mt-3 text-lg text-neutral-700">{g.description}</p>
        <p className="mt-4 text-sm text-neutral-500">By {site.name}. Published {fmt(g.published)}{g.updated !== g.published ? `, updated ${fmt(g.updated)}` : ""}.{g.reviewed ? ` Fact-checked by ${g.reviewed}.` : ""}</p>
        {toc.length > 2 ? (
          <nav aria-label="On this page" className="mt-6 rounded-xl border border-neutral-200 p-4">
            <p className="text-sm font-bold uppercase tracking-wider text-ink">On this page</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px]">{toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-brand-700 hover:underline">{h.text}</a></li>)}</ol>
          </nav>
        ) : null}
        <GuideBody body={g.body} />
        {g.health ? <p className="mt-8 rounded-xl bg-neutral-100 p-4 text-sm leading-6 text-neutral-700">This guide is general information, not medical advice. Speak to a doctor or pharmacist about your own health, especially if you are pregnant, breastfeeding, taking medication or living with a medical condition.</p> : null}
        <section aria-labelledby="sources-h" className="mt-10">
          <h2 id="sources-h" className="text-xl font-bold">Sources</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-neutral-700">{g.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener" className="text-brand-700 underline underline-offset-2">{s.title}</a></li>)}</ol>
        </section>
        {products.length ? (
          <section aria-labelledby="shop-h" className="mt-10 rounded-2xl bg-brand-50 p-5 sm:p-6">
            <h2 id="shop-h" className="text-xl font-bold">From the WellnessXpressBrand shop</h2>
            <p className="mt-1 text-sm text-neutral-700">Products are not a replacement for the habits above. Read the label and ask us on WhatsApp before you order.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {products.map((p) => { const r = priceRange(p); return (
                <li key={p.slug}><Link href={`/product/${p.slug}`} className="block rounded-xl bg-white p-4 hover:shadow"><span className="font-semibold text-ink">{p.name}</span>{r ? <span className="block text-sm text-neutral-600">{r.min === r.max ? naira(r.min) : `From ${naira(r.min)}`}</span> : null}</Link></li>
              ); })}
            </ul>
          </section>
        ) : null}
        {related.length ? (
          <section aria-labelledby="more-h" className="mt-10">
            <h2 id="more-h" className="text-xl font-bold">More guides</h2>
            <ul className="mt-3 space-y-2">{related.map((x) => <li key={x.slug}><Link href={`/guides/${x.slug}`} className="font-semibold text-brand-700 hover:underline">{x.title}</Link></li>)}</ul>
          </section>
        ) : null}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
    </article>
  );
}
