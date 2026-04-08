import { apiRequestText } from './client';

export type TranslateProvider =
  | 'google'
  | 'bing'
  | 'lingva'
  | 'yandex'
  | 'deepl'
  | 'deeplx'
  | 'libre';

export const TRANSLATE_PROVIDERS: { id: TranslateProvider; name: string; free: boolean }[] = [
  { id: 'google',  name: 'Google',        free: true  },
  { id: 'bing',    name: 'Bing',          free: true  },
  { id: 'lingva',  name: 'Lingva',        free: true  },
  { id: 'yandex',  name: 'Yandex',        free: true  },
  { id: 'deepl',   name: 'DeepL',         free: false },
  { id: 'deeplx',  name: 'DeepLX',        free: false },
  { id: 'libre',   name: 'LibreTranslate', free: false },
];

export const TRANSLATE_LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'es',    label: 'Spanish' },
  { code: 'fr',    label: 'French' },
  { code: 'de',    label: 'German' },
  { code: 'it',    label: 'Italian' },
  { code: 'pt',    label: 'Portuguese' },
  { code: 'ru',    label: 'Russian' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'ko',    label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'nl',    label: 'Dutch' },
  { code: 'pl',    label: 'Polish' },
  { code: 'sv',    label: 'Swedish' },
  { code: 'tr',    label: 'Turkish' },
  { code: 'vi',    label: 'Vietnamese' },
  { code: 'th',    label: 'Thai' },
  { code: 'hi',    label: 'Hindi' },
  { code: 'id',    label: 'Indonesian' },
];

/** Call the ST /api/translate/<provider> endpoint and return the translated string. */
export async function translateText(
  text: string,
  targetLang: string,
  provider: TranslateProvider = 'google',
): Promise<string> {
  // Yandex expects { chunks: string[], lang } instead of { text, lang }
  const body =
    provider === 'yandex'
      ? JSON.stringify({ chunks: [text], lang: targetLang })
      : JSON.stringify({ text, lang: targetLang });

  return apiRequestText(`/api/translate/${provider}`, { method: 'POST', body });
}
