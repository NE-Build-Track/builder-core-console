import type { NavCounts } from "@/domain/views";

import type { IconName } from "./icons";

/** The console's pages, in rail order. The rail, the palette and the top bar all read this list. */
export const PAGES = [
  { key: "health", href: "/", label: "Health", icon: "health" },
  { key: "network", href: "/network", label: "Network", icon: "network" },
  { key: "money", href: "/money", label: "Money", icon: "money" },
  { key: "users", href: "/users", label: "Users", icon: "users" },
  { key: "usage", href: "/usage", label: "Usage", icon: "usage" },
  { key: "jobs", href: "/jobs", label: "Jobs", icon: "jobs" },
  { key: "sources", href: "/sources", label: "Sources & gaps", icon: "sources" },
] as const satisfies readonly { key: keyof NavCounts; href: string; label: string; icon: IconName }[];

export function isCurrent(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
