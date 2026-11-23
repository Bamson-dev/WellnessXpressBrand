import type { Metadata } from "next";
import Link from "next/link";
import { publishedGuides } from "@/lib/guides";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Weight Management Guides",
  description: "Practical, sourced guides on weight management, bloating, appetite and everyday Nigerian eating from WellnessXpressBrand.",
  alternates: { canonical: "/guides" },
  openGraph: { title: "Weight Management Guides", url: `${site.url}/guides` },
};

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function GuidesIndex() {
  const guides = publishedGuides();
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: site.url },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${site.url}/guides` },
  ] };
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow">Guides</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Weight management guides</h1>
      <p className="mt-3 max-w-2xl text-lg text-neutral-700">Plain-language guides on weight management, bloating, appetite and eating well with Nigerian food. Each guide lists its sources. They are general information, not medical advice.</p>
      {guides.length ? (
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {guides.map((g) => (
            <li key={g.slug} className="card flex flex-col p-5 sm:p-6">
              <h2 className="text-xl font-bold leading-snug"><Link href={`/guides/${g.slug}`} className="hover:text-brand-700">{g.title}</Link></h2>
              <p className="mt-2 flex-1 text-neutral-700">{g.description}</p>
              <p className="mt-4 text-sm text-neutral-500">Updated {fmt(g.updated)}</p>
            </li>
          ))}
        </ul>
      ) : <p className="mt-8 text-neutral-600">New guides are on the way. <Link href="/shop" className="font-semibold text-brand-700 underline">Browse our products</Link> in the meantime.</p>}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
    </div>
  );
}
