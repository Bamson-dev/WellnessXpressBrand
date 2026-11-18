import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import ShopGrid from "@/components/ShopGrid";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = CATEGORIES.find((x) => x.slug === params.slug);
  return c ? { title: c.name, description: c.description, alternates: { canonical: `/category/${c.slug}` } } : {};
}

export default function Category({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string> }) {
  const c = CATEGORIES.find((x) => x.slug === params.slug);
  if (!c) notFound();
  return <ShopGrid sp={searchParams} category={c.slug} basePath={`/category/${c.slug}`} title={c.name} intro={c.description} />;
}
