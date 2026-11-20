import type { Metadata } from "next";

/** The cart page is a client component, so its title and robots rule live here. Cart contents are private to the visitor. */
export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: true } };

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
