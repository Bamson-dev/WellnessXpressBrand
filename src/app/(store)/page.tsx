import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import Newsletter from "@/components/Newsletter";
import { getCategories, getProducts } from "@/lib/products";
import { faqs } from "@/lib/faqs";
import { site, whatsappLink } from "@/lib/site";

export default function Home() {
  const categories = getCategories();
  const featured = getProducts().slice(0, 4);
  const wa = whatsappLink();
  const reasons = [
    ["Clear product information", "Every product page lists what it is, what it costs and whether it is in stock."],
    ["Simple ordering", "Add items to your cart, review the summary and send your order details in a few steps."],
    ["Real support", "Reach the team through the contact page or WhatsApp when you have a question about an order."],
    ["Written policies", "Shipping, returns and privacy policies are published so you know what to expect before you buy."],
  ];
  return (
    <>
      <section className="bg-sage-50">
        <div className="container-x grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-clay-500">Wellness and lifestyle</p>
            <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">Products for a healthier, simpler everyday routine.</h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-ink/75">{site.name} is an online store for wellness and lifestyle products. Browse the catalogue and order from your phone or computer.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary">Shop now</Link>
              <Link href="/about" className="btn btn-outline">About the brand</Link>
            </div>
          </div>
          <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-sage-200 to-sage-100 p-8" role="img" aria-label="Brand image placeholder">
            <div className="flex h-full items-end rounded-2xl border border-white/60 p-6">
              <p className="font-serif text-2xl text-sage-700">{site.shortName}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x py-16" aria-labelledby="cats">
        <h2 id="cats" className="text-3xl">Shop by category</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {categories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="rounded-2xl border border-sage-100 bg-white p-8 transition hover:shadow-md">
              <h3 className="text-2xl">{c.name}</h3>
              <p className="mt-2 text-ink/70">{c.description}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-sage-600">Browse {c.name.toLowerCase()} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x py-8" aria-labelledby="featured">
        <div className="flex items-end justify-between">
          <h2 id="featured" className="text-3xl">Featured products</h2>
          <Link href="/shop" className="text-sm font-semibold text-sage-600">View all</Link>
        </div>
        {featured.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{featured.map((p) => <ProductCard key={p.sku} p={p} />)}</div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-sage-200 bg-white p-10 text-center">
            <p className="font-serif text-xl">The catalogue is being prepared.</p>
            <p className="mt-2 text-ink/70">Products will appear here soon. Join the newsletter below to hear when the store opens.</p>
          </div>
        )}
      </section>

      <section className="container-x py-16" aria-labelledby="about-brand">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="about-brand" className="text-3xl">About {site.name}</h2>
            <p className="mt-4 leading-7 text-ink/80">We sell wellness and lifestyle products online. Our aim is a store where product details, prices and policies are easy to find and easy to understand.</p>
            <Link href="/about" className="btn btn-outline mt-6">Read more</Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {reasons.map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="text-lg">{t}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/75">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-sage-700 py-14 text-white" aria-labelledby="support">
        <div className="container-x text-center">
          <h2 id="support" className="text-3xl">Need help with an order?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sage-100">Send us a message and the team will reply.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn bg-white text-sage-700 hover:bg-sage-50">Contact us</Link>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn border border-white text-white hover:bg-white/10">WhatsApp</a>}
          </div>
        </div>
      </section>

      <section className="container-x py-16" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-3xl">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-sage-100 rounded-2xl bg-white">
          {faqs.slice(0, 4).map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold">{f.q}</summary>
              <p className="mt-3 leading-7 text-ink/80">{f.a}</p>
            </details>
          ))}
        </div>
        <Link href="/faq" className="mt-4 inline-block text-sm font-semibold text-sage-600">See all questions</Link>
      </section>

      <section className="container-x pb-8 text-center" aria-labelledby="nl">
        <h2 id="nl" className="text-3xl">Stay in the loop</h2>
        <p className="mt-2 text-ink/70">Get store news by email. Unsubscribe any time by contacting us.</p>
        <Newsletter />
      </section>
    </>
  );
}
