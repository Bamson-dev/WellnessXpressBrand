"use client";
import Link from "next/link";
import { useState } from "react";
import { nav, site } from "@/lib/site";
import { useCart } from "./CartProvider";

export default function Header() {
  const [open, setOpen] = useState(false);
  const { count, ready } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b border-sage-100 bg-cream/95 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between">
        <Link href="/" className="font-serif text-xl font-semibold text-sage-700" onClick={() => setOpen(false)}>
          {site.shortName}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm font-medium hover:text-sage-600">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/cart" className="relative rounded-full border border-sage-200 px-4 py-2 text-sm font-medium hover:bg-sage-50" aria-label={`Cart, ${ready ? count : 0} items`}>
            Cart{ready && count > 0 ? ` (${count})` : ""}
          </Link>
          <button className="rounded-lg border border-sage-200 p-2 md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-sage-100 bg-cream md:hidden">
          <ul className="container-x py-2">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block py-3 text-base font-medium" onClick={() => setOpen(false)}>{n.label}</Link>
              </li>
            ))}
            <li><Link href="/account" className="block py-3 text-base font-medium" onClick={() => setOpen(false)}>Account</Link></li>
          </ul>
        </nav>
      )}
    </header>
  );
}
