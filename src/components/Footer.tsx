import Link from "next/link";
import Image from "next/image";
import { getContact } from "@/lib/settings";
import { displayPhone } from "@/lib/site";
import { IconWhatsApp } from "@/components/icons";

const cols = [
  { title: "Shop", links: [{ href: "/shop", label: "All products" }, { href: "/category/individual", label: "Individual Products" }, { href: "/category/combos", label: "Combo Sets" }, { href: "/cart", label: "Cart" }] },
  { title: "Company", links: [{ href: "/about", label: "About Us" }, { href: "/contact", label: "Contact" }, { href: "/faq", label: "FAQs" }, { href: "/guides", label: "Guides" }, { href: "/product-information", label: "Product information" }] },
  { title: "Policies", links: [{ href: "/shipping", label: "Shipping and Delivery" }, { href: "/returns", label: "Returns and Refunds" }, { href: "/privacy", label: "Privacy Policy" }, { href: "/terms", label: "Terms and Conditions" }] },
];

export default function Footer() {
  const c = getContact();
  const socials = [
    { href: c.instagram, label: "Instagram" },
    { href: c.facebook, label: "Facebook" },
    { href: c.tiktok, label: "TikTok" },
  ].filter((s) => /^https:\/\//.test(s.href || ""));
  return (
    <footer className="mt-20 border-t border-neutral-200 bg-brand-50/60">
      <div className="container-x grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/brand/logo-480.webp" alt="" width={56} height={50} className="h-auto w-14" />
            <span>
              <span className="block text-lg font-bold text-brand-900">WellnessXpressBrand</span>
              <span className="block text-sm text-neutral-600">Your Weightloss Journey Starts Here.</span>
            </span>
          </Link>
          <ul className="mt-6 space-y-2 text-[15px]">
            {c.whatsapp ? (
              <li>
                <a className="inline-flex items-center gap-2 font-medium text-ink hover:text-brand-700" href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I need help with my order.")}`} target="_blank" rel="noopener noreferrer">
                  <IconWhatsApp className="h-5 w-5 text-[#1FA855]" /> {displayPhone(c.whatsapp)}
                </a>
              </li>
            ) : null}
            {c.email ? <li><a className="font-medium text-ink hover:text-brand-700" href={`mailto:${c.email}`}>{c.email}</a></li> : null}
          </ul>
          {socials.length ? (
            <ul className="mt-4 flex gap-4 text-sm font-semibold">
              {socials.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{s.label}</a></li>)}
            </ul>
          ) : null}
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">{col.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => <li key={l.href}><Link href={l.href} className="text-[15px] text-neutral-700 hover:text-brand-700">{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-neutral-200">
        <div className="container-x flex flex-col gap-2 pb-24 pt-5 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} WellnessXpressBrand. All rights reserved.</p>
          <p>Prices in Nigerian Naira (₦). Payment by bank transfer. <Link href="/shipping" className="font-semibold text-brand-700 hover:underline">Free delivery on orders ₦50,000+.</Link></p>
        </div>
      </div>
    </footer>
  );
}
