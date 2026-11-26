"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label className="shrink-0">
      <span className="sr-only">Sort products</span>
      <select value={value} onChange={(e) => {
        const u = new URLSearchParams(sp.toString());
        if (e.target.value === "featured") u.delete("sort"); else u.set("sort", e.target.value);
        u.delete("page");
        router.push(u.toString() ? `${path}?${u}` : path);
      }} className="field w-auto cursor-pointer pr-8">
        <option value="featured">Featured</option>
        <option value="newest">Newest</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
    </label>
  );
}
