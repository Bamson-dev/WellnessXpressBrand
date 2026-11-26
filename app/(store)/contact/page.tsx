import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { getContact } from "@/lib/settings";
import { displayPhone } from "@/lib/site";
import { IconWhatsApp } from "@/components/icons";

export const metadata: Metadata = { title: "Contact", description: "Contact WellnessXpressBrand on WhatsApp or by email for product questions, order help and delivery updates across Nigeria.", alternates: { canonical: "/contact" } };

export default function Contact() {
  const c = getContact();
  return (
    <div className="container-x grid gap-10 py-10 sm:py-14 lg:grid-cols-2">
      <div>
        <p className="eyebrow">Contact</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">We are here to help</h1>
        <p className="mt-3 text-lg text-neutral-600">The fastest way to reach us is WhatsApp. Include your order number if you have one.</p>
        <div className="mt-8 space-y-4">
          {c.whatsapp ? (
            <a href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I need help with my order.")}`} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-4 p-5 hover:border-[#1FA855]">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#1FA855] text-white"><IconWhatsApp className="h-6 w-6" /></span>
              <span><span className="block text-sm text-neutral-500">WhatsApp</span><span className="text-lg font-semibold">{displayPhone(c.whatsapp)}</span></span>
            </a>
          ) : null}
          {c.email ? (
            <a href={`mailto:${c.email}`} className="card flex items-center gap-4 p-5 hover:border-brand-500">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-xl font-bold text-brand-700">@</span>
              <span className="min-w-0"><span className="block text-sm text-neutral-500">Email</span><span className="block break-all text-lg font-semibold">{c.email}</span></span>
            </a>
          ) : null}
        </div>
      </div>
      <div>
        <h2 className="text-xl">Send us a message</h2>
        <div className="mt-4"><ContactForm /></div>
      </div>
    </div>
  );
}
