"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Cards with `.lift` glow where the pointer is: the pointer position goes into --mx and --my. */
export function PointerGlow() {
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".lift");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}

/** Re-read the stack every `seconds` while the tab is visible. The server's cache makes this cheap. */
export function AutoRefresh({ seconds }: { readonly seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}

/** On Sources & gaps, open and highlight the gap named in the URL fragment (#g6). */
export function GapOpener() {
  const pathname = usePathname();
  useEffect(() => {
    function open(): void {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      target.classList.add("flash");
      const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "center" });
      target.querySelector("summary")?.focus({ preventScroll: true });
      window.setTimeout(() => target.classList.remove("flash"), 2400);
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [pathname]);
  return null;
}
