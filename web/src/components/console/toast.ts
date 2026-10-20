/** A tiny event bus for toasts, so any client component can raise one without a provider. */
export type ToastDetail = { readonly title: string; readonly body?: string };

export const TOAST_EVENT = "console:toast";

export function toast(title: string, body?: string): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { title, body } }));
}
