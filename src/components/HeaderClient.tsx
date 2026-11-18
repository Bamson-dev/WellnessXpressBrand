"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import CartDrawer from "@/components/CartDrawer";
import { IconCart, IconClose, IconMenu, IconSearch, IconWhatsApp } from "@/components/icons";

export default function HeaderClient({ nav, whatsapp }: { nav: { href: string; label: string }[]; whatsapp: string }) {
  const { count, ready, setOpen } = useCart();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setMenu(false); setSearch(false); }, [path]);
  useEffect(() => { if (search) input.current?.focus(); }, [search]);
  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menu]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : "/shop");
  };

  return (
    <>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <form onSubmit={submit} role="search" className="hidden md:block">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search products"
              className="h-11 w-56 rounded-full border border-neutral-300 bg-neutral-50 pl-9 pr-4 text-[15px] focus:border-brand-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/20 xl:w-64" />
          </label>
        </form>
        <button type="button" onClick={() => setSearch((s) => !s)} className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-brand-50 md:hidden" aria-label="Search products" aria-expanded={search}>
          <IconSearch className="h-[22px] w-[22px]" />
        </button>
        <button type="button" onClick={() => setOpen(true)} className="relative grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-brand-50" aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}>
          <IconCart className="h-6 w-6" />
          {ready && count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white">{count}</span>
          ) : null}
        </button>
        <button type="button" onClick={() => setMenu(true)} className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-brand-50 lg:hidden" aria-label="Open menu" aria-expanded={menu}>
          <IconMenu className="h-6 w-6" />
        </button>
      </div>

      {search ? (
        <form onSubmit={submit} role="search" className="absolute inset-x-0 top-full border-b border-neutral-200 bg-white px-4 py-3 shadow-sm md:hidden">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search products" className="field pl-11" />
          </label>
        </form>
      ) : null}

      {menu ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-hidden="true" tabIndex={-1} onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-5">
              <span className="text-base font-bold text-brand-900">Menu</span>
              <button onClick={() => setMenu(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-neutral-100" aria-label="Close menu"><IconClose className="h-6 w-6" /></button>
            </div>
            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-3">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className={`flex min-h-[52px] items-center rounded-xl px-4 text-[17px] font-medium ${path === n.href ? "bg-brand-50 text-brand-900" : "text-ink hover:bg-neutral-50"}`}>{n.label}</Link>
              ))}
              <Link href="/faq" className="flex min-h-[52px] items-center rounded-xl px-4 text-[17px] font-medium text-ink hover:bg-neutral-50">FAQs</Link>
            </nav>
            {whatsapp ? (
              <div className="border-t border-neutral-200 p-4">
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I need help with my order.")}`} target="_blank" rel="noopener noreferrer" className="btn btn-wa w-full"><IconWhatsApp /> Chat on WhatsApp</a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <CartDrawer />
    </>
  );
}
