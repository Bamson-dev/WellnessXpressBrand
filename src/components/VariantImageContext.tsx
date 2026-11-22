"use client";
import { createContext, useContext, useState } from "react";

type VariantImageContextValue = { selectedImage: number; setSelectedImage: (index: number) => void };
const VariantImageContext = createContext<VariantImageContextValue | null>(null);

export function VariantImageProvider({ children, initialIndex = 0 }: { children: React.ReactNode; initialIndex?: number }) {
  const [selectedImage, setSelectedImage] = useState(initialIndex);
  return <VariantImageContext.Provider value={{ selectedImage, setSelectedImage }}>{children}</VariantImageContext.Provider>;
}

export function useVariantImage() {
  return useContext(VariantImageContext);
}
