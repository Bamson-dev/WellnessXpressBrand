"use client";

import { useState } from "react";
import Gallery from "@/components/Gallery";
import { PurchaseBox, type VariantOpt } from "@/components/AddToCart";

type Product = { slug: string; name: string; image: string | null };

export default function ProductVariantGallery({
  images,
  name,
  meta,
  product,
  variants,
}: {
  images: string[];
  name: string;
  meta?: Record<string, { alt: string; caption: string }>;
  product: Product;
  variants: VariantOpt[];
}) {
  const firstIndex = Math.max(0, variants.findIndex((v) => v.inStock));
  const [selectedImage, setSelectedImage] = useState(firstIndex);
  return (
    <>
      <Gallery images={images} name={name} meta={meta} selectedIndex={selectedImage} onSelect={setSelectedImage} />
      <PurchaseBox product={product} variants={variants} onVariantChange={(index) => setSelectedImage(Math.min(index, Math.max(0, images.length - 1)))} />
    </>
  );
}
