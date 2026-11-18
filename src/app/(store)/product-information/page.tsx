import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";
import { getContact, getSetting } from "@/lib/settings";
import { IconWhatsApp } from "@/components/icons";

export const metadata: Metadata = { title: "Product information", description: "Important information about WellnessXpress products.", alternates: { canonical: "/product-information" } };

export default function Page() {
  const c = getContact();
  return (
    <PolicyPage title="Important product information" text={getSetting<string>("productNotice").replace(/\n/g, "\n\n")}>
      {c.whatsapp ? (
        <a href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent("Hello WellnessXpressBrand. I have a question about a product.")}`} target="_blank" rel="noopener noreferrer" className="btn btn-wa mt-8"><IconWhatsApp /> Ask about a product</a>
      ) : null}
    </PolicyPage>
  );
}
