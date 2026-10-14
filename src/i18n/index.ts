import { en } from "./en";
import { ko } from "./ko";

export type Locale = "ko" | "en";
export type StringKey = keyof typeof ko;
const DICTS: Record<Locale, Record<StringKey, string>> = { ko, en };
let current: Locale = "ko";

// ?lang=ko|en wins; otherwise Korean browsers get Korean and everyone else English.
export function detectLocale(search: string, navigatorLanguage: string): Locale {
  const asked = new URLSearchParams(search).get("lang");
  if (asked === "ko" || asked === "en") return asked;
  return navigatorLanguage.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function setLocale(l: Locale) {
  current = l;
}

// The string for `key` in the current language with {name} filled from `vars` (left as is if missing).
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return DICTS[current][key].replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}
