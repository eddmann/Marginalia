import { LocaleWithTextInfo } from '@/types/misc';
import { franc } from 'franc-min';
import { iso6392 } from 'iso-639-2';
import { iso6393To1 } from 'iso-639-3';

export const isCJKStr = (str: string) => {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(str ?? '');
};

export const isCJKLang = (lang: string | null | undefined): boolean => {
  if (!lang) return false;
  const normalizedLang = normalizedLangCode(lang);
  return ['zh', 'ja', 'ko', 'zho', 'jpn', 'kor'].includes(normalizedLang);
};

export const normalizedLangCode = (lang: string | null | undefined): string => {
  if (!lang) return '';
  return lang.split('-')[0]!.toLowerCase();
};

export const isSameLang = (lang1?: string | null, lang2?: string | null): boolean => {
  if (!lang1 || !lang2) return false;
  const normalizedLang1 = normalizedLangCode(lang1);
  const normalizedLang2 = normalizedLangCode(lang2);
  return normalizedLang1 === normalizedLang2;
};

export const isValidLang = (lang?: string) => {
  if (!lang) return false;
  if (typeof lang !== 'string') return false;
  if (['und', 'mul', 'mis', 'zxx'].includes(lang)) return false;
  const code = normalizedLangCode(lang);
  return iso6392.some((l) => l.iso6391 === code || l.iso6392B === code);
};

export const code6392to6391 = (code: string): string => {
  const lang = iso6392.find((l) => l.iso6392B === code);
  return lang?.iso6391 || '';
};

const commonIndivToMacro: Record<string, string> = {
  cmn: 'zho',
  arb: 'ara',
  arz: 'ara',
  ind: 'msa',
  zsm: 'msa',
  nob: 'nor',
  nno: 'nor',
  pes: 'fas',
  quy: 'que',
};

const code6393to6391 = (code: string): string => {
  const macro = commonIndivToMacro[code] || code;
  return iso6393To1[macro] || '';
};

export const detectLanguage = (content: string): string => {
  try {
    const iso6393Lang = franc(content.substring(0, 1000));
    const iso6391Lang = code6393to6391(iso6393Lang) || 'en';
    return iso6391Lang;
  } catch {
    console.warn('Language detection failed, defaulting to en.');
    return 'en';
  }
};

export const getLanguageInfo = (lang: string) => {
  if (!lang) return {};
  try {
    const canonical = Intl.getCanonicalLocales(lang)[0]!;
    const locale = new Intl.Locale(canonical) as LocaleWithTextInfo;
    const isCJK = ['zh', 'ja', 'kr'].includes(locale.language);
    const direction = (locale.getTextInfo?.() ?? locale.textInfo)?.direction;
    return { canonical, locale, isCJK, direction };
  } catch (_e) {

    return {};
  }
};
