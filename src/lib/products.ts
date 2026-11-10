import productsData from "@/data/products.json";
import categoriesData from "@/data/categories.json";

export type Availability = "in_stock" | "out_of_stock" | "preorder";
export type ProductStatus = "published" | "draft" | "sample";

export interface Product {
  sku: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  salePrice: number | null;
  images: string[];
  category: string;
  availability: Availability;
  attributes: Record<string, string>;
  status: ProductStatus;
}
export interface Category {
  slug: string;
  name: string;
  description: string;
}

const showSamples = process.env.SHOW_SAMPLE_PRODUCTS === "true";

export function visible(p: Product) {
  return p.status === "published" || (showSamples && p.status === "sample");
}
export const isSample = (p: Product) => p.status === "sample";
export const effectivePrice = (p: Product) => (p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price);

export function getCategories(): Category[] {
  return categoriesData as Category[];
}
export function getProducts(category?: string, q?: string): Product[] {
  const query = (q || "").trim().toLowerCase();
  return (productsData as Product[])
    .filter(visible)
    .filter((p) => !category || p.category === category)
    .filter((p) => !query || p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query));
}
export function getProduct(slug: string): Product | undefined {
  return (productsData as Product[]).filter(visible).find((p) => p.slug === slug);
}
export function getProductBySku(sku: string): Product | undefined {
  return (productsData as Product[]).filter(visible).find((p) => p.sku === sku);
}
