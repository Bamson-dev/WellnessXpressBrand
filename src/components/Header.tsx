import Link from "next/link";
import Image from "next/image";
import { getContact, getSetting } from "@/lib/settings";
import HeaderClient from "@/components/HeaderClient";

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/category/individual", label: "Individual Products" },
  { href: "/category/combos", label: "Combo Sets" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const announcement = getSetting<string>("announcement");
  const contact = getContact();
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      {announcement ? (
        <div className="bg-brand-900 text-white">
          <p className="container-x py-2 text-center text-[13px] font-medium leading-snug sm:text-sm">{announcement}</p>
        </div>
      ) : null}
      <div className="border-b border-neutral-200">
        <div className="container-x flex h-16 items-center gap-3 sm:h-[72px]">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="WellnessXpressBrand home">
            <Image src="/brand/logo-480.webp" alt="" width={44} height={44} className="h-10 w-10 sm:h-11 sm:w-11" priority />
            <span className="leading-tight">
              <span className="block text-[15px] font-bold text-brand-900 sm:text-base">WellnessXpress</span>
              <span className="hidden text-[11px] font-medium text-neutral-500 sm:block">Your Weightloss Journey Starts Here.</span>
            </span>
          </Link>
          <nav aria-label="Main" className="ml-6 hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 text-[15px] font-medium text-neutral-700 transition hover:bg-brand-50 hover:text-brand-900">
                {n.label}
              </Link>
            ))}
          </nav>
          <HeaderClient nav={NAV} whatsapp={contact.whatsapp} />
        </div>
      </div>
    </header>
  );
}
