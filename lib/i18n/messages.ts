import { en } from './en';
import { zh, type ZhMessages } from './zh';

export const locales = ['en', 'zh'] as const;
export type Locale = (typeof locales)[number];
export type Messages = ZhMessages;

export const defaultLocale: Locale = 'en';

export const LOCALE_COOKIE = 'leakish.locale';

const messagesByLocale: Record<Locale, Messages> = { en, zh };

export function getMessages(locale: Locale): Messages {
  return messagesByLocale[locale] ?? messagesByLocale[defaultLocale];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'zh';
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export const htmlLang: Record<Locale, string> = {
  en: 'en',
  zh: 'zh-CN',
};

export const ogLocale: Record<Locale, string> = {
  en: 'en_US',
  zh: 'zh_CN',
};

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
};
