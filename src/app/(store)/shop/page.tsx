import type { Metadata } from "next";
import ShopGrid from "@/components/ShopGrid";

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }): Metadata {
  return {
    title: searchParams.q ? `Search: ${searchParams.q.slice(0, 40)}` : "Shop all products",
    description: "Shop WellnessXpress products and combo sets. Order without an account and pay by bank transfer.",
    alternates: { canonical: "/shop" },
    robots: searchParams.q ? { index: false, follow: true } : undefined,
  };
}

export default function Shop({ searchParams }: { searchParams: Record<string, string> }) {
  return <ShopGrid sp={searchParams} basePath="/shop" title="Shop" intro="All WellnessXpress products and combo sets." />;
}
