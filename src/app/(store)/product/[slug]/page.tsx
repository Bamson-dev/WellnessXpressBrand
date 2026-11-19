import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { effective, getCategories, getProduct, inStock, priceRange, relatedProducts } from "@/lib/catalog";
import { getContact } from "@/lib/settings";
import { PurchaseBox } from "@/components/AddToCart";
import ProductCard from "@/components/ProductCard";
import Gallery from "@/components/Gallery";
import ReviewForm from "@/components/ReviewForm";
import { db } from "@/lib/db";
import RichText, { plainText } from "@/components/RichText";
import { currentAdmin } from "@/lib/auth";
import { mediaMeta } from "@/lib/media";
import { TrackView } from "@/components/pixel";
import { IconBank, IconChevron, IconInfo, IconTruck, IconWhatsApp } from "@/components/icons";
import { naira, site } from "@/lib/site";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getProduct(params.slug);
  if (!p) return { title: "Product not found", robots: { index: false } };
  const r = priceRange(p);
  const title = p.seoTitle || p.name;
  const desc = p.metaDescription || `${p.shortDescription} ${r ? (r.min === r.max ? naira(r.min) : `From ${naira(r.min)}`) : ""}. Free delivery across Nigeria. Order from WellnessXpressBrand.`.trim();
  const image = p.ogImage || p.images[0];
  return {
    title, description: desc, alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title, description: desc, url: `${site.url}/product/${p.slug}`, images: image ? [{ url: image, alt: p.name }] : undefined },
    robots: p.noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductPage({ params, searchParams }: { params: { slug: string }; searchParams: { preview?: string } }) {
  const preview = searchParams.preview === "1" && !!(await currentAdmin());
  const p = getProduct(params.slug, { includeUnpublished: preview });
  if (!p) {
    const moved = db().prepare("SELECT new_slug FROM product_redirects WHERE old_slug = ?").get(params.slug);
    if (moved) permanentRedirect(`/product/${String(moved.new_slug)}`);
  }
  if (!p || !p.variants.length) notFound();
  const contact = getContact();
  const related = relatedProducts(p);
  const reviews = db().prepare("SELECT customer_name,rating,review_text,created_at FROM product_reviews WHERE product_id=? AND status='approved' AND verified_purchase=1 ORDER BY created_at DESC LIMIT 20").all(p.id);
  const r = priceRange(p);
  const variants = p.variants.map((v) => ({
    id: v.id, label: v.label, price: effective(v), compareAt: v.salePrice != null && v.salePrice < v.price ? v.price : null, inStock: inStock(v),
    detail: [v.size && v.size !== v.label ? v.size : "", v.duration && v.duration.toLowerCase() !== v.label.toLowerCase() ? v.duration : ""].filter(Boolean).join(" · "),
  }));
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: plainText(p.description), sku: p.variants[0]?.sku,
    image: p.images.map((i) => site.url + i), brand: { "@type": "Brand", name: "WellnessXpress" },
    offers: r ? {
      "@type": "AggregateOffer", priceCurrency: "NGN", lowPrice: r.min, highPrice: r.max, offerCount: p.variants.length,
      availability: p.variants.some(inStock) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${site.url}/product/${p.slug}`,
      shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "NGN" }, shippingDestination: { "@type": "DefinedRegion", addressCountry: "NG" } },
    } : undefined,
    aggregateRating: reviews.length ? { "@type": "AggregateRating", ratingValue: (reviews.reduce((t, x) => t + Number(x.rating), 0) / reviews.length).toFixed(1), reviewCount: reviews.length } : undefined,
  };
  const cat = getCategories().find((c) => c.slug === p.category);
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.url },
      ...(cat ? [{ "@type": "ListItem", position: 2, name: cat.name, item: `${site.url}/category/${cat.slug}` }] : []),
      { "@type": "ListItem", position: cat ? 3 : 2, name: p.name, item: `${site.url}/product/${p.slug}` },
    ],
  };
  const wa = contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(`Hello WellnessXpressBrand. I have a question about ${p.name}.`)}` : null;

  return (
    <div className="container-x py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-sm text-neutral-500">
        <Link href="/" className="hover:text-brand-700">Home</Link><IconChevron className="h-3.5 w-3.5" />
        <Link href={`/category/${p.category}`} className="hover:text-brand-700">{p.type === "combo" ? "Combo Sets" : "Individual Products"}</Link><IconChevron className="h-3.5 w-3.5" />
        <span className="text-ink">{p.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          {preview ? <p className="mb-3 rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-900 lg:col-span-2">Preview: this product is {p.status.replace("_", " ")} and hidden from customers.</p> : null}
          <Gallery images={p.images} name={p.name} meta={mediaMeta(p.images)} />
          {p.slug === "tummy-set" ? (
            <p className="mt-3 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm font-semibold text-brand-900">
              Set contents: Tummy Balance Big + Detox Seed
            </p>
          ) : null}
        </div>
        <div>
          {p.type === "combo" ? <span className="tag">Combo set</span> : null}
          <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">{p.name}</h1>
          <p className="mt-3 text-lg text-neutral-700">{p.shortDescription}</p>
          <div className="mt-6">
            <PurchaseBox product={{ slug: p.slug, name: p.name, image: p.images[0] || null }} variants={variants} />
          </div>

          {p.type === "combo" && p.items.length ? (
            <section className="mt-8 rounded-2xl border border-neutral-200 p-5" aria-labelledby="inc-h">
              <h2 id="inc-h" className="text-lg">What is in this set</h2>
              <ul className="mt-3 divide-y divide-neutral-100">
                {p.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                      {it.itemImage ? <Image src={it.itemImage} alt="" fill sizes="56px" className="object-contain" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {it.itemSlug ? <Link href={`/product/${it.itemSlug}`} className="font-semibold hover:text-brand-700">{it.itemName}</Link> : <span className="font-semibold">{it.itemName}</span>}
                      <p className="text-sm text-neutral-500">
                        {it.sizeNote ? `Size: ${it.sizeNote}` : "Size: ask us on WhatsApp"}{it.quantityNote ? ` · Quantity: ${it.quantityNote}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <ul className="mt-8 grid gap-3 text-[15px] text-neutral-700 sm:grid-cols-2">
            <li className="flex gap-3 rounded-xl bg-brand-50/70 p-4"><IconBank className="h-5 w-5 shrink-0 text-brand-700" /> Pay by bank transfer. We confirm your payment before we process your order.</li>
            <li className="flex gap-3 rounded-xl bg-brand-50/70 p-4"><IconTruck className="h-5 w-5 shrink-0 text-brand-700" /> <span><strong className="text-brand-900">Free delivery across Nigeria.</strong> All 36 states and Abuja, no minimum order.</span></li>
          </ul>
          {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 font-semibold text-[#178a45] hover:underline"><IconWhatsApp /> Questions about {p.name}? Ask us on WhatsApp</a> : null}
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-xl">Description</h2>
            <RichText text={p.description} />
          </section>
          <section className="card p-6" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-xl">Verified customer reviews</h2>
            {reviews.length ? <ul className="mt-4 space-y-4">{reviews.map((review, i) => <li key={i} className="border-t border-neutral-100 pt-4"><p aria-label={`${Number(review.rating)} out of 5 stars`} className="font-semibold text-amber-600">{"★".repeat(Number(review.rating))}{"☆".repeat(5 - Number(review.rating))}</p><p className="mt-2 whitespace-pre-line text-neutral-700">{String(review.review_text)}</p><p className="mt-2 text-sm text-neutral-500">Verified purchase · {String(review.customer_name)}</p></li>)}</ul> : <p className="mt-2 text-sm text-neutral-600">No reviews yet.</p>}
            {p.status === "published" ? <details className="mt-5 border-t border-neutral-100 pt-4"><summary className="cursor-pointer font-semibold">Bought this product? Write a review</summary><ReviewForm product={p.slug} /></details> : null}
          </section>
          {p.ingredients ? (
            <section className="card p-6"><h2 className="text-xl">Ingredients</h2><p className="mt-3 whitespace-pre-line leading-7 text-neutral-700">{p.ingredients}</p></section>
          ) : null}
          <section className="card p-6">
            <h2 className="text-xl">Directions for use</h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-neutral-700">{p.directions || "Read the product label. For directions for use, message us on WhatsApp before you order."}</p>
          </section>
          {p.information ? (
            <section className="card p-6"><h2 className="text-xl">Product information</h2><p className="mt-3 whitespace-pre-line leading-7 text-neutral-700">{p.information}</p></section>
          ) : null}
          {p.faqs.length ? (
            <section className="card p-6">
              <h2 className="text-xl">Questions</h2>
              {p.faqs.map((f) => (<details key={f.q} className="mt-3 border-t border-neutral-100 pt-3"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-neutral-700">{f.a}</p></details>))}
            </section>
          ) : null}
        </div>
        <aside className="h-fit rounded-2xl border border-brand-100 bg-brand-50/60 p-6">
          <div className="flex items-center gap-2"><IconInfo className="h-5 w-5 text-brand-700" /><h2 className="text-lg">Before you use</h2></div>
          <p className="mt-3 text-neutral-700">Read the product label before use. If you are pregnant, breastfeeding, taking medication or have a medical condition, speak to a healthcare professional first.</p>
          <Link href="/product-information" className="mt-3 inline-block font-semibold text-brand-700 hover:underline">Important product information</Link>
        </aside>
      </div>

      {related.length ? (
        <section className="mt-14" aria-labelledby="rel-h">
          <h2 id="rel-h" className="text-2xl">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">{related.map((x) => <ProductCard key={x.id} p={x} />)}</div>
        </section>
      ) : null}

      <TrackView event="ViewContent" data={{ content_ids: p.variants.map((v) => v.sku), content_type: "product", currency: "NGN", value: r?.min || 0 }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
    </div>
  );
}
