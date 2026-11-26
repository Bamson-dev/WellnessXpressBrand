import type { Metadata } from "next";
import Link from "next/link";
import { faqs } from "@/lib/faqs";

export const metadata: Metadata = { title: "FAQs", description: "Answers about ordering, bank transfer payment, delivery and returns.", alternates: { canonical: "/faq" } };

export default function Faq() {
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow">Help</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Frequently asked questions</h1>
      <div className="mt-8 max-w-3xl divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
        {faqs.map((f) => (
          <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
              {f.q}<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 leading-7 text-neutral-700">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-neutral-700">Still need help? <Link href="/contact" className="font-semibold text-brand-700 hover:underline">Contact us</Link>.</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </div>
  );
}
