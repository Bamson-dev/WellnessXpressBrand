import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCategories, getCategoryRedirect } from "@/lib/catalog";
import ShopGrid from "@/components/ShopGrid";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = getCategories().find((x) => x.slug === params.slug);
  if (!c) {
    const target = getCategoryRedirect(params.slug);
    if (target) redirect(`/category/${target}`);
  }
  return c ? { title: c.seoTitle || c.name, description: c.metaDescription || c.description, alternates: { canonical: `/category/${c.slug}` } } : {};
}

export default function Category({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string> }) {
  const c = getCategories().find((x) => x.slug === params.slug);
  if (!c) {
    const target = getCategoryRedirect(params.slug);
    if (target) redirect(`/category/${target}`);
  }
  if (!c) notFound();
  return <ShopGrid sp={searchParams} category={c.slug} basePath={`/category/${c.slug}`} title={c.name} intro={c.description} />;
}
