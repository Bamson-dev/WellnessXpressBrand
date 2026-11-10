import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "Contact the WellnessXpressBrand team.", alternates: { canonical: "/contact" } };

export default function Contact() {
  const wa = whatsappLink();
  return (
    <div className="container-x grid gap-10 py-12 md:grid-cols-2">
      <div>
        <h1 className="text-4xl">Contact us</h1>
        <p className="mt-4 leading-7 text-ink/80">Send a message about an order, a product or anything else. Include your order reference if you have one.</p>
        <ul className="mt-6 space-y-3 text-sm">
          {wa ? (
            <li><a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></li>
          ) : (
            <li><button className="btn btn-primary" disabled>WhatsApp not configured yet</button></li>
          )}
          {site.email && <li>Email: <a className="underline" href={`mailto:${site.email}`}>{site.email}</a></li>}
        </ul>
      </div>
      <ContactForm />
    </div>
  );
}
