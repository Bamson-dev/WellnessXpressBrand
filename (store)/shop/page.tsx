import type { Metadata } from "next";
import ShopGrid from "@/components/ShopGrid";

export async function generateMetadata(props: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const searchParams = await props.searchParams;
  return {
    title: searchParams.q ? `Search: ${searchParams.q.slice(0, 40)}` : "Shop all products",
    description: "Shop WellnessXpress products and combo sets. Order without an account and pay by bank transfer.",
    alternates: { canonical: "/shop" },
    robots: searchParams.q ? { index: false, follow: true } : undefined,
  };
}

export default async function Shop(props: { searchParams: Promise<Record<string, string>> }) {
  const searchParams = await props.searchParams;
  return <ShopGrid sp={searchParams} basePath="/shop" title="Shop" intro="All WellnessXpress products and combo sets." />;
}
