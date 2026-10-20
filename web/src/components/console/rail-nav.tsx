"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

import type { NavCounts } from "@/domain/views";

import { Icon } from "./icons";
import { isCurrent, PAGES } from "./pages";

/**
 * The section rail. The highlight is one named <ViewTransition>, so on navigation it slides from the old
 * page's link to the new one. Counts arrive from the server when its reads finish (null until then).
 */
export function RailNav({ counts }: { readonly counts: NavCounts | null }) {
  const pathname = usePathname();
  return (
    <ul className="rail-list" role="list">
      {PAGES.map((page) => {
        const current = isCurrent(page.href, pathname);
        const count = page.key === "health" ? null : counts?.[page.key];
        const flagged = page.key === "health" && counts && counts.health !== "ok";
        return (
          <li key={page.href}>
            <Link className="nav-link" href={page.href} aria-current={current ? "page" : undefined}>
              {current ? (
                <ViewTransition name="nav-pill">
                  <span className="nav-pill" aria-hidden="true" />
                </ViewTransition>
              ) : null}
              <Icon name={page.icon} />
              <span>{page.label}</span>
              {flagged ? (
                <>
                  <span className="nav-flag" aria-hidden="true" />
                  <span className="sr-only">(needs attention)</span>
                </>
              ) : null}
              {typeof count === "number" ? <span className="count">{count}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
