"use client";

import { useEffect, useRef } from "react";

/**
 * One tooltip for every element with `data-tip`: a manual popover placed with CSS anchor positioning
 * where supported, and by measurement otherwise. Shown on hover and on keyboard focus; Escape hides it.
 */
export function Tooltips() {
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = tip.current;
    if (!element) return;
    const anchored = CSS.supports("anchor-name: --a");
    let owner: HTMLElement | null = null;

    function hide(): void {
      owner?.style.removeProperty("anchor-name");
      owner = null;
      try {
        element?.hidePopover();
      } catch {
        // Already hidden.
      }
    }
    function show(target: HTMLElement): void {
      if (owner === target || !element) return;
      hide();
      owner = target;
      element.textContent = target.dataset.tip ?? "";
      if (anchored) {
        target.style.setProperty("anchor-name", "--tip");
        element.classList.add("anchored");
      }
      try {
        element.showPopover();
      } catch {
        return;
      }
      if (!anchored) {
        const box = target.getBoundingClientRect();
        const size = element.getBoundingClientRect();
        const x = Math.max(16, Math.min(window.innerWidth - size.width - 16, box.left + box.width / 2 - size.width / 2));
        const y = box.top - size.height - 8 < 8 ? box.bottom + 8 : box.top - size.height - 8;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
      }
    }
    const over = (event: Event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-tip]");
      if (target) show(target);
      else if (owner) hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", over);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", over);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide);
    };
  }, []);
  return <div ref={tip} className="tip" popover="manual" role="tooltip" />;
}
