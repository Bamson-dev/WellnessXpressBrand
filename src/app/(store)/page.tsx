import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getCategories, listProducts } from "@/lib/catalog";
import { getContact, getSetting } from "@/lib/settings";
import ProductCard from "@/components/ProductCard";
import { IconBank, IconChevron, IconInfo, IconShield, IconTruck, IconUser, IconWhatsApp } from "@/components/icons";
import { FREE_DELIVERY_TEXT, FREE_DELIVERY_TITLE, site } from "@/lib/site";
import { db } from "@/lib/db";
import { getSeo } from "@/lib/seo";
import { can, currentAdmin } from "@/lib/auth";
import { getBanner, liveBanners } from "@/lib/banners";
import BannerBlock from "@/components/BannerBlock";

export function generateMetadata(): Metadata {
  const seo = getSeo();
  const title = seo.homeTitle || `${site.name} | Your Weightloss Journey Starts Here.`;
  const description = seo.homeDescription || site.description;
  return { title: { absolute: title }, description, alternates: { canonical: "/" }, openGraph: { title, description, url: site.url, images: [{ url: seo.ogImage || "/og.jpg", alt: site.name }] } };
}

type Hero = { title: string; accent: string; text: string; primaryLabel: string; primaryUrl: string; secondaryLabel: string; secondaryUrl: string };

export default async function Home(props: { searchParams: Promise<{ bannerPreview?: string }> }) {
  const searchParams = await props.searchParams;
  const hero = getSetting<Hero>("homeHero");
  const previewId = Number(searchParams.bannerPreview);
  const preview = previewId > 0 && can(await currentAdmin(), "banners") ? getBanner(previewId) : null;
  const heroBanners = liveBanners("hero").filter((b) => b.id !== preview?.id);
  const promoBanners = liveBanners("promo").filter((b) => b.id !== preview?.id);
  const singles = listProducts({ category: "individual", featured: true, perPage: 8 }).items;
  const combos = listProducts({ category: "combos", perPage: 12 }).items;
  const categories = getCategories();
  const contact = getContact();
  const testimonials = db().prepare("SELECT customer_name,quote FROM testimonials WHERE approved=1 ORDER BY id DESC LIMIT 6").all();
  const notice = getSetting<string>("productNotice");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-100 bg-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-full w-[62%] -skew-x-12 bg-gradient-to-br from-brand-50 to-brand-100/60 max-lg:hidden" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-brand-50 lg:hidden" />
        <div className="container-x relative grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:py-20">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-bold tracking-wide text-white sm:text-sm"><IconTruck className="h-4 w-4" /> {FREE_DELIVERY_TITLE}</p>
            <h1 className="mt-3 text-[2.4rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-[3.6rem]">
              {hero.title} {hero.accent ? <span className="text-brand-700">{hero.accent}</span> : null}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-neutral-700">
              {hero.text}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {hero.primaryLabel ? <Link href={hero.primaryUrl || "/shop"} className="btn btn-primary px-8 text-base">{hero.primaryLabel}</Link> : null}
              {hero.secondaryLabel ? <Link href={hero.secondaryUrl || "#combos"} className="btn btn-outline px-8 text-base">{hero.secondaryLabel}</Link> : null}
            </div>
            <ul className="mt-8 grid grid-cols-1 gap-3 text-[15px] text-neutral-700 sm:grid-cols-3">
              <li className="flex items-center gap-2"><IconUser className="h-5 w-5 text-brand-700" /> No account needed</li>
              <li className="flex items-center gap-2"><IconBank className="h-5 w-5 text-brand-700" /> Pay by bank transfer</li>
              <li className="flex items-center gap-2"><IconTruck className="h-5 w-5 text-brand-700" /> Free delivery nationwide</li>
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <Image src="/images/banners/hero-products.webp" alt="WellnessXpress Tummy Balance, Get Snatched Oil, Appetite Suppressant, Trim Down Coffee and Metabolic Reset" width={1400} height={1200} priority sizes="(max-width: 1024px) 100vw, 50vw" className="h-auto w-full rounded-3xl" />
          </div>
        </div>
      </section>

      {preview ? <div className="container-x pt-8"><p className="mb-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">Preview of banner #{preview.id} ({preview.placement}). Customers do not see this preview.</p><BannerBlock b={preview} priority /></div> : null}
      {heroBanners.length ? <div className="container-x space-y-6 pt-8">{heroBanners.map((b, i) => <BannerBlock key={b.id} b={b} priority={i === 0} />)}</div> : null}

      {/* Free delivery promotion */}
      <section className="bg-brand-50" aria-labelledby="free-delivery-h">
        <div className="container-x flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-700 text-white"><IconTruck className="h-6 w-6" /></span>
            <div>
              <h2 id="free-delivery-h" className="text-xl font-extrabold text-brand-900 sm:text-2xl">{FREE_DELIVERY_TITLE}</h2>
              <p className="mt-1 text-neutral-700">{FREE_DELIVERY_TEXT} No minimum order.</p>
            </div>
          </div>
          <Link href="/shop" className="btn btn-primary shrink-0 px-8">Shop now</Link>
        </div>
      </section>

      {/* Categories */}
      <section className="container-x py-14 sm:py-16" aria-labelledby="cat-h">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Shop by category</p>
            <h2 id="cat-h" className="mt-2 text-2xl sm:text-3xl">Find what you need</h2>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {categories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="group card flex items-center gap-4 overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:gap-6 sm:p-5">
              <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-xl bg-brand-50 sm:w-36">
                {c.image ? <Image src={c.image} alt="" fill sizes="144px" className="object-contain" /> : <div className="grid h-full place-items-center text-xs text-neutral-500">Browse products</div>}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl">{c.name}</h3>
                <p className="mt-1 text-neutral-600">{c.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 font-semibold text-brand-700">Shop now <IconChevron className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="bg-brand-50/50 py-14 sm:py-16" aria-labelledby="feat-h">
        <div className="container-x">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Individual products</p>
              <h2 id="feat-h" className="mt-2 text-2xl sm:text-3xl">Our products</h2>
            </div>
            <Link href="/category/individual" className="hidden font-semibold text-brand-700 hover:underline sm:inline">View all</Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-5">
            {singles.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}
          </div>
          <Link href="/category/individual" className="btn btn-outline mt-6 w-full sm:hidden">View all products</Link>
        </div>
      </section>

      {/* Combos */}
      <section id="combos" className="container-x scroll-mt-28 py-14 sm:py-16" aria-labelledby="combo-h">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Combo sets</p>
            <h2 id="combo-h" className="mt-2 text-2xl sm:text-3xl">Products packed together</h2>
          </div>
          <Link href="/category/combos" className="hidden font-semibold text-brand-700 hover:underline sm:inline">View all</Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
          {combos.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      {/* Updated catalogue flyer */}
      <section className="container-x py-10 sm:py-14" aria-labelledby="catalogue-flyer-h">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
          <div className="bg-brand-800 px-5 py-5 text-center text-white sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-wide">Updated catalogue</p>
            <h2 id="catalogue-flyer-h" className="mt-1 text-2xl font-extrabold sm:text-3xl">New product names and prices</h2>
            <p className="mt-2 text-sm text-white/90">Check the updated individual and combo prices before ordering.</p>
          </div>
          <Image src="/images/banners/updated-price-list.svg" alt="WellnessXpress updated product and combo price list" width={1080} height={1600} className="h-auto w-full" />
          <div className="p-5 text-center sm:p-7"><Link href="/shop" className="btn btn-primary px-8">Shop updated catalogue</Link></div>
        </div>
      </section>

      {promoBanners.length ? <div className="container-x space-y-6 py-6">{promoBanners.map((b) => <BannerBlock key={b.id} b={b} />)}</div> : null}

      {testimonials.length ? <section className="container-x py-12" aria-labelledby="testimonials-heading"><p className="eyebrow">Customer testimonials</p><h2 id="testimonials-heading" className="mt-2 text-2xl sm:text-3xl">What customers have shared</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{testimonials.map((t, i) => <figure key={i} className="card p-5"><blockquote className="whitespace-pre-line text-neutral-700">“{String(t.quote)}”</blockquote><figcaption className="mt-4 font-semibold">{String(t.customer_name)}</figcaption></figure>)}</div></section> : null}

      {/* Why us — only what the store actually does */}
      <section className="border-y border-neutral-100 bg-white py-14 sm:py-16" aria-labelledby="why-h">
        <div className="container-x">
          <p className="eyebrow">Why WellnessXpressBrand</p>
          <h2 id="why-h" className="mt-2 max-w-2xl text-2xl sm:text-3xl">Simple ordering, from cart to your door</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <IconUser className="h-6 w-6" />, t: "No account needed", d: "Order as a guest. We only ask for the details we need to deliver your order." },
              { icon: <IconBank className="h-6 w-6" />, t: "Pay by bank transfer", d: "Transfer to our account and send us your payment confirmation from your order page." },
              { icon: <IconShield className="h-6 w-6" />, t: "Payment checked by a person", d: "We confirm every transfer in our bank account before we process your order." },
              { icon: <IconWhatsApp className="h-6 w-6" />, t: "Help on WhatsApp", d: "Questions before or after you order? Message us and include your order number." },
            ].map((x) => (
              <div key={x.t} className="card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">{x.icon}</span>
                <h3 className="mt-4 text-lg">{x.t}</h3>
                <p className="mt-1.5 text-neutral-600">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How ordering works / guides */}
      <section className="container-x py-14 sm:py-16" aria-labelledby="how-h">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Guide</p>
            <h2 id="how-h" className="mt-2 text-2xl sm:text-3xl">How to order</h2>
            <ol className="mt-6 space-y-4">
              {[
                "Add products to your cart and tap Checkout.",
                "Enter your name, phone number and delivery address. No account needed.",
                "Transfer the exact amount shown to our bank account.",
                "Send your payment confirmation from your order page.",
                "We confirm your payment and process your order.",
              ].map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">{i + 1}</span>
                  <span className="pt-1.5 text-[17px] text-neutral-800">{s}</span>
                </li>
              ))}
            </ol>
            <Link href="/faq" className="mt-6 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">Read the FAQs <IconChevron className="h-4 w-4" /></Link>
          </div>
          <div id="product-info" className="rounded-3xl border border-brand-100 bg-brand-50/70 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-700"><IconInfo className="h-6 w-6" /></span>
              <h2 className="text-xl sm:text-2xl">Important product information</h2>
            </div>
            <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-neutral-800">
              {notice.split("\n").filter(Boolean).map((l) => <p key={l}>{l}</p>)}
            </div>
            {contact.whatsapp ? (
              <a href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I have a question about a product.")}`} target="_blank" rel="noopener noreferrer" className="btn btn-wa mt-6">
                <IconWhatsApp /> Ask about a product
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
