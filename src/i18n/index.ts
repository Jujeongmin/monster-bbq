import { parseItemKey } from "../../shared/content/items";
import { en } from "./en";
import { ko } from "./ko";

export type Locale = "ko" | "en";
export type StringKey = keyof typeof ko;
const DICTS: Record<Locale, Record<StringKey, string>> = { ko, en };
let current: Locale = "ko";

export const LOCALES: Locale[] = ["ko", "en"];
const isLocale = (v: unknown): v is Locale => v === "ko" || v === "en";
// the language picked in the settings, kept per device
export const LOCALE_KEY = "monster-bbq:lang";

// ?lang=ko|en wins, then the language picked in the settings; otherwise Korean browsers get Korean and
// everyone else English.
export function detectLocale(search: string, navigatorLanguage: string, picked: string | null = null): Locale {
  const asked = new URLSearchParams(search).get("lang");
  if (isLocale(asked)) return asked;
  if (isLocale(picked)) return picked;
  return navigatorLanguage.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function setLocale(l: Locale) {
  current = l;
}

export const locale = (): Locale => current;

// The string for `key` in the current language with {name} filled from `vars` (left as is if missing).
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  return DICTS[current][key].replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

// An item key ("boar_belly:premium") as players read it: name, then grade for parts.
export function itemName(key: string): string {
  const item = parseItemKey(key);
  if (!item) return key;
  const name = t(`item.${item.id}` as StringKey);
  return item.grade ? `${name} ${t(`grade.${item.grade}` as StringKey)}` : name;
}
