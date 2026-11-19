import { site } from "@/lib/site";
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
  return c ? { title: c.seoTitle || c.name, description: c.metaDescription || c.description, alternates: { canonical: `/category/${c.slug}` },
    openGraph: { title: c.seoTitle || c.name, description: c.metaDescription || c.description, url: `${site.url}/category/${c.slug}`, images: c.image ? [{ url: c.image, alt: c.name }] : undefined },
    robots: c.noindex ? { index: false, follow: true } : undefined } : {};
}

export default function Category({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string> }) {
  const c = getCategories().find((x) => x.slug === params.slug);
  if (!c) {
    const target = getCategoryRedirect(params.slug);
    if (target) redirect(`/category/${target}`);
  }
  if (!c) notFound();
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: site.url },
    { "@type": "ListItem", position: 2, name: c.name, item: `${site.url}/category/${c.slug}` },
  ] };
  return (
    <>
      <ShopGrid sp={searchParams} category={c.slug} basePath={`/category/${c.slug}`} title={c.name} intro={c.description} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
    </>
  );
}
