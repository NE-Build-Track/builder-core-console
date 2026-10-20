import { toast } from "./toast";

/** Theme preference: system by default; a stored choice wins. Read before paint by THEME_SCRIPT. */
export const THEME_KEY = "builder-console-theme";

/** Runs in <head> before first paint so a stored theme never flashes the other one. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : !window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** Switch light and dark, with a view transition where motion is allowed. The choice stays in this browser. */
export function toggleTheme(): void {
  const next = isDark() ? "light" : "dark";
  const apply = () => {
    document.documentElement.dataset.theme = next;
  };
  const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (motion && "startViewTransition" in document) document.startViewTransition(apply);
  else apply();
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage can be blocked; the theme still applies for this page.
  }
  toast(next === "dark" ? "Dark theme" : "Light theme", "Saved in this browser only.");
}
