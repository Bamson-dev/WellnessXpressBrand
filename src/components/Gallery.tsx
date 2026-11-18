"use client";
import Image from "next/image";
import { useState } from "react";

const isLocal = (s: string) => s.startsWith("/images/");

export default function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const cur = images[i];
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-neutral-100 bg-gradient-to-b from-white to-brand-50">
        {cur ? (
          isLocal(cur)
            ? <Image src={cur} alt={`${name} by WellnessXpress`} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-contain" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={cur} alt={`${name} by WellnessXpress`} className="absolute inset-0 h-full w-full object-contain" />
        ) : <div className="grid h-full place-items-center text-neutral-400">No photo yet</div>}
      </div>
      {images.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Product photos">
          {images.map((src, k) => (
            <button key={src} type="button" role="tab" aria-selected={k === i} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-brand-50 ${k === i ? "border-brand-700" : "border-transparent"}`}>
              {isLocal(src) ? <Image src={src} alt="" fill sizes="80px" className="object-contain" /> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-contain" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
