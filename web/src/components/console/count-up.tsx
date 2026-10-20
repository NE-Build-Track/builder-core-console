"use client";

import { useEffect, useRef, useState } from "react";

const FORMATS = {
  int: (n: number) => Math.round(n).toLocaleString("en-US"),
  usd2: (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  usd4: (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
} as const;

/**
 * A number that counts up to its value when it first appears, and glides to a new value on refresh.
 * The server renders the final text (`children`), so without script, and with reduced motion, there is
 * no animation at all. The exact value stays in the surrounding <data>.
 */
export function CountUp({ to, format, children }: { readonly to: number; readonly format: keyof typeof FORMATS; readonly children: string }) {
  const [text, setText] = useState(children);
  const from = useRef(0);
  useEffect(() => {
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = requestAnimationFrame(() => setText(children));
      from.current = to;
      return () => cancelAnimationFrame(frame);
    }
    const start = from.current;
    const began = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 1100);
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      setText(progress === 1 ? children : FORMATS[format](start + (to - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = to;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, format, children]);
  return <span suppressHydrationWarning>{text}</span>;
}
