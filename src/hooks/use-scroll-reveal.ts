import { useEffect } from "react";

/**
 * Global scroll-reveal: any element with class `reveal`, `reveal-book`,
 * `reveal-rise`, or `reveal-rule` gets `is-visible` toggled when it
 * enters the viewport. Also drives `--py` for `.parallax-y`.
 *
 * Single observer per mount, re-scans on route change via the `key` arg.
 */
export function useScrollReveal(key?: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const selector = ".reveal, .reveal-book, .reveal-rise, .reveal-rule";
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));

    if (reduce) {
      nodes.forEach(n => n.classList.add("is-visible"));
      return;
    }

    // Stagger via data-stagger="80" (ms per index from data-index)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const stagger = Number(el.dataset.stagger ?? 0);
            const idx = Number(el.dataset.index ?? 0);
            const delay = stagger * idx;
            if (delay) el.style.transitionDelay = `${delay}ms`;
            el.classList.add("is-visible");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    nodes.forEach((n) => io.observe(n));

    // Parallax (cheap, throttled with rAF)
    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>(".parallax-y"));
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        parallaxNodes.forEach((el) => {
          const speed = Number(el.dataset.speed ?? 0.15);
          el.style.setProperty("--py", `${-(y * speed).toFixed(1)}px`);
        });
        raf = 0;
      });
    };
    if (parallaxNodes.length) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    return () => {
      io.disconnect();
      if (parallaxNodes.length) window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [key]);
}
