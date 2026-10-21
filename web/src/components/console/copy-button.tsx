"use client";

import { Icon } from "./icons";
import { toast } from "./toast";

/** Copy a value (a key prefix, an id) to the clipboard. Secrets are never on the page to copy. */
export function CopyButton({ value, label }: { readonly value: string; readonly label: string }) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast(`Copied ${label}`, value);
    } catch {
      toast("Copy blocked here", value);
    }
  }
  return (
    <button type="button" className="copy" onClick={copy} data-tip={`Copy ${label}`}>
      {value}
      <Icon name="copy" />
    </button>
  );
}

/** Copy a longer text (a curl command, a new key) behind a labelled button; the toast never echoes it. */
export function CopyAction({ value, label, primary = false }: { readonly value: string; readonly label: string; readonly primary?: boolean }) {
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast(`Copied ${label}`);
    } catch {
      toast("Copy blocked here", "Select the text and copy it by hand.");
    }
  }
  return (
    <button type="button" className={primary ? "btn primary" : "btn"} onClick={copy}>
      <Icon name="copy" />
      Copy {label}
    </button>
  );
}
