import type { Metadata } from "next";
import { faqs } from "@/lib/faqs";

export const metadata: Metadata = { title: "FAQ", description: "Answers to common questions about ordering from WellnessXpressBrand.", alternates: { canonical: "/faq" } };

export default function FAQ() {
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <div className="container-x max-w-3xl py-12">
      <h1 className="text-4xl">Frequently asked questions</h1>
      <div className="mt-8 divide-y divide-sage-100 rounded-2xl bg-white">
        {faqs.map((f) => (
          <details key={f.q} className="p-5"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-3 leading-7 text-ink/80">{f.a}</p></details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
