"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { GAPS } from "@/domain/gaps";

import { Icon, type IconName } from "./icons";
import { PAGES } from "./pages";
import { toggleTheme } from "./theme";

type Command = { readonly group: string; readonly label: string; readonly icon: IconName; readonly hint: string; readonly run: () => void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function score(text: string, query: string): number {
  if (!query) return 1;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);
  let matched = 0;
  for (const char of haystack) if (char === needle[matched]) matched += 1;
  return matched === needle.length ? 10 : 0;
}

/**
 * The command palette (⌘K / Ctrl K, or "/"): jump to a page, a usage window, a gap, or a job by pasting
 * its id. A native <dialog>, so focus handling and Escape come from the browser. Every command
 * navigates or changes the theme; none writes to the stack.
 */
export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const mac = useSyncExternalStore(
    () => () => undefined,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => true,
  );

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Command[] = [
      ...PAGES.map((page) => ({ group: "Go to", label: page.label, icon: page.icon, hint: "page", run: go(page.href) })),
      ...(["24h", "7d", "30d"] as const).map((window) => ({
        group: "Usage window",
        label: `Usage over the last ${window === "24h" ? "24 hours" : window === "7d" ? "7 days" : "30 days"}`,
        icon: "usage" as const,
        hint: window,
        run: go(`/usage?window=${window}`),
      })),
      { group: "Actions", label: "Toggle light and dark theme", icon: "sun", hint: "theme", run: toggleTheme },
      ...GAPS.map((item) => ({ group: "Known gaps", label: `${item.id}: ${item.title}`, icon: "gap" as const, hint: item.owner, run: go(`/sources#${item.id.toLowerCase()}`) })),
    ];
    const id = query.trim();
    return UUID.test(id)
      ? [{ group: "Jobs", label: `Look up job ${id}`, icon: "jobs", hint: "job", run: go(`/jobs?id=${encodeURIComponent(id.toLowerCase())}`) }, ...base]
      : base;
  }, [query, router]);

  const items = useMemo(
    () =>
      commands
        .map((command) => ({ command, score: score(`${command.label} ${command.group} ${command.hint}`, query.trim()) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => (query.trim() ? right.score - left.score : 0))
        .map((item) => item.command),
    [commands, query],
  );
  const active = Math.min(selected, Math.max(0, items.length - 1));

  function open(): void {
    const element = dialog.current;
    if (!element || element.open) return;
    setQuery("");
    setSelected(0);
    element.showModal();
    input.current?.focus();
  }

  function run(index: number): void {
    const command = items[index];
    if (!command) return;
    dialog.current?.close();
    window.setTimeout(command.run, 10);
  }

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent): void {
      const typing = /input|textarea|select/i.test((document.activeElement as HTMLElement | null)?.tagName ?? "");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      } else if (event.key === "/" && !typing && !dialog.current?.open) {
        event.preventDefault();
        open();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onInputKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (active + step + items.length) % items.length;
      setSelected(next);
      document.getElementById(`palette-option-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    }
  }

  let group = "";
  return (
    <>
      <button className="btn search-btn" type="button" onClick={open} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">
        <Icon name="search" />
        <span className="label">Search or jump to…</span>
        <span className="sr-only">Open command palette</span>
        <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <dialog
        ref={dialog}
        className="palette"
        aria-label="Command palette"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <search>
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `palette-option-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Jump to a page, a window, a gap, or paste a job id…"
            aria-label="Command"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={onInputKey}
          />
          <kbd>esc</kbd>
        </search>
        <ul id="palette-list" role="listbox" aria-label="Commands">
          {items.length === 0 ? (
            <li className="empty" role="presentation">
              Nothing matches “{query}”.
            </li>
          ) : (
            items.flatMap((command, index) => {
              const rows = [];
              if (!query.trim() && command.group !== group) {
                group = command.group;
                rows.push(
                  <li key={`group-${group}`} className="group" role="presentation">
                    {group}
                  </li>,
                );
              }
              rows.push(
                <li
                  key={`${command.group}-${command.label}`}
                  id={`palette-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => run(index)}
                  onPointerMove={() => setSelected(index)}
                >
                  <Icon name={command.icon} />
                  <span>{command.label}</span>
                  <span className="hint">{command.hint}</span>
                </li>,
              );
              return rows;
            })
          )}
        </ul>
        <footer>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </dialog>
    </>
  );
}
