"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "./icons";
import { TOAST_EVENT, type ToastDetail } from "./toast";

type Shown = ToastDetail & { readonly id: number; readonly leaving: boolean };

/** Toasts in a manual popover (top layer, no focus stealing), announced politely. */
export function Toaster() {
  const host = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<readonly Shown[]>([]);
  useEffect(() => {
    let next = 0;
    function onToast(event: Event): void {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      const id = (next += 1);
      try {
        if (host.current && !host.current.matches(":popover-open")) host.current.showPopover();
      } catch {
        // Popover unsupported: the region still renders in flow.
      }
      setToasts((list) => [...list, { ...detail, id, leaving: false }]);
      window.setTimeout(() => setToasts((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item))), 4200);
      window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4600);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return (
    <div ref={host} className="toasts" popover="manual" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={item.leaving ? "toast out" : "toast"}>
          <Icon name="check" />
          <div>
            <b>{item.title}</b>
            {item.body ? <span>{item.body}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
