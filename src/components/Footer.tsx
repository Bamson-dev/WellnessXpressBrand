import Link from "next/link";
import { site, whatsappLink } from "@/lib/site";

const cols = [
  { title: "Shop", links: [["All products", "/shop"], ["Wellness", "/category/wellness"], ["Lifestyle", "/category/lifestyle"], ["Cart", "/cart"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["FAQ", "/faq"], ["Account", "/account"]] },
  { title: "Policies", links: [["Privacy policy", "/privacy"], ["Terms and conditions", "/terms"], ["Shipping and delivery", "/shipping"], ["Returns and refunds", "/returns"]] },
];

export default function Footer() {
  const wa = whatsappLink();
  return (
    <footer className="mt-24 border-t border-sage-100 bg-sage-900 text-sage-100">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div>
          <p className="font-serif text-xl font-semibold text-white">{site.name}</p>
          <p className="mt-3 text-sm leading-6 text-sage-200">{site.tagline}.</p>
          {wa ? (
            <a href={wa} className="btn btn-primary mt-5" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
          ) : null}
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {c.links.map(([l, h]) => (
                <li key={h}><Link href={h} className="text-sage-200 hover:text-white">{l}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-sage-200">
        &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
      </div>
    </footer>
  );
}
