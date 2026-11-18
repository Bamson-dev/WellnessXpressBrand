import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "About Us", description: "About WellnessXpressBrand.", alternates: { canonical: "/about" } };

export default function About() {
  const text = getSetting<string>("about");
  return (
    <div className="container-x grid items-start gap-10 py-10 sm:py-14 lg:grid-cols-[1.2fr_1fr]">
      <div className="prose-page">
        <p className="eyebrow">About us</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">WellnessXpressBrand</h1>
        <p className="!mt-3 text-lg font-medium text-brand-700">Your Weightloss Journey Starts Here.</p>
        {text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/shop" className="btn btn-primary">Shop products</Link>
          <Link href="/contact" className="btn btn-outline">Contact us</Link>
        </div>
      </div>
      <Image src="/images/banners/hero-products.webp" alt="WellnessXpress products" width={1400} height={1200} className="h-auto w-full rounded-3xl border border-neutral-100" sizes="(max-width: 1024px) 100vw, 45vw" />
    </div>
  );
}
