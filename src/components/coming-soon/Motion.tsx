"use client";
import { useEffect } from "react";

/** Tiny motion controller: scroll reveals, pointer parallax and a scroll offset variable. No libraries. */
export default function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    let io: IntersectionObserver | undefined;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
    } else {
      root.classList.add("js-motion");
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io?.unobserve(e.target); } }),
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
      els.forEach((el) => io!.observe(el));
    }
    if (reduce) return () => io?.disconnect();

    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const stage = document.querySelector<HTMLElement>("[data-stage]");
    let raf = 0;
    let sy = 0;
    const apply = () => { raf = 0; root.style.setProperty("--sy", String(sy)); };
    const onScroll = () => { sy = Math.min(window.scrollY, 1200); if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("scroll", onScroll, { passive: true });

    let move: ((e: PointerEvent) => void) | undefined;
    let leave: (() => void) | undefined;
    if (hero && stage && window.matchMedia("(pointer: fine)").matches) {
      move = (e) => {
        const r = stage.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
        const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
        stage.style.setProperty("--px", x.toFixed(3));
        stage.style.setProperty("--py", y.toFixed(3));
      };
      leave = () => { stage.style.setProperty("--px", "0"); stage.style.setProperty("--py", "0"); };
      hero.addEventListener("pointermove", move, { passive: true });
      hero.addEventListener("pointerleave", leave);
    }
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (hero && move) hero.removeEventListener("pointermove", move);
      if (hero && leave) hero.removeEventListener("pointerleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
