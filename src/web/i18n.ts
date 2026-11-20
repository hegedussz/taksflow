import { hu } from './locales/hu.js';
import { en } from './locales/en.js';
import type { Lang } from '../services/userService.js';

export type MessageKey = keyof typeof hu;
const dictionaries: Record<Lang, Record<MessageKey, string>> = { hu, en };

export const LANGS: readonly Lang[] = ['hu', 'en'];
export const isLang = (v: unknown): v is Lang => v === 'hu' || v === 'en';

/** Fordítás {paraméter} behelyettesítéssel; ismeretlen kulcsnál magát a kulcsot adja vissza. */
export function t(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const template = dictionaries[lang][key as MessageKey] ?? dictionaries.hu[key as MessageKey] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}
