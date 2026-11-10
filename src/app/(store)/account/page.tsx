import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Account", robots: { index: false } };
export default function Account() {
  return (
    <div className="container-x max-w-2xl py-16 text-center">
      <h1 className="text-4xl">Customer accounts</h1>
      <p className="mt-4 leading-7 text-ink/75">Customer accounts are not available yet. You can order as a guest from the cart and checkout pages, and contact us about any order.</p>
      <div className="mt-8 flex justify-center gap-3"><Link href="/shop" className="btn btn-primary">Shop</Link><Link href="/contact" className="btn btn-outline">Contact us</Link></div>
    </div>
  );
}
