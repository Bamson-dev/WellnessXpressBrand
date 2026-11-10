import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: `About ${site.name}, an online store for wellness and lifestyle products.`, alternates: { canonical: "/about" } };

export default function About() {
  return (
    <div className="container-x max-w-3xl py-12 prose-page">
      <h1 className="text-4xl">About {site.name}</h1>
      <p>{site.name} is an online store for wellness and lifestyle products. We want shopping to be simple: clear product details, clear prices and written policies you can read before you order.</p>
      <h2>What we offer</h2>
      <p>The store is organised into Wellness and Lifestyle categories. The product range is added by the business and will grow over time.</p>
      <h2>How we work</h2>
      <ul>
        <li>Product pages show the price, availability and a description.</li>
        <li>Orders are recorded as requests, and the team confirms payment and delivery with you.</li>
        <li>You can reach the team from the contact page.</li>
      </ul>
      <p className="mt-6 text-sm text-ink/60">Business details such as company name and registered address will be added here once confirmed by the owner.</p>
      <Link href="/shop" className="btn btn-primary mt-8">Browse the shop</Link>
    </div>
  );
}
