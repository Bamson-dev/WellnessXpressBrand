import Link from "next/link";
import type { Banner } from "@/lib/banners";

/** One promotional banner. Separate desktop and mobile images when both are set. Text stays readable on small screens. */
export default function BannerBlock({ b, priority = false }: { b: Banner; priority?: boolean }) {
  const img = b.desktopImage || b.mobileImage;
  const link = b.buttonUrl && b.buttonText ? (b.buttonUrl.startsWith("http") ? <a href={b.buttonUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5 px-8">{b.buttonText}</a> : <Link href={b.buttonUrl} className="btn btn-primary mt-5 px-8">{b.buttonText}</Link>) : null;
  return (
    <section className="overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white" aria-label={b.heading || "Promotion"}>
      <div className={`grid items-center gap-6 p-6 sm:p-10 ${img ? "md:grid-cols-2" : ""}`}>
        <div>
          {b.heading ? <h2 className="text-2xl font-extrabold leading-tight text-brand-900 sm:text-3xl">{b.heading}</h2> : null}
          {b.description ? <p className="mt-3 whitespace-pre-line text-neutral-700">{b.description}</p> : null}
          {link}
        </div>
        {img ? (
          <picture>
            {b.mobileImage && b.desktopImage ? <source media="(max-width: 767px)" srcSet={b.mobileImage} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={b.imageAlt || b.heading || ""} width={1200} height={800} loading={priority ? "eager" : "lazy"} decoding="async" className="h-auto w-full rounded-2xl object-contain" />
          </picture>
        ) : null}
      </div>
    </section>
  );
}
