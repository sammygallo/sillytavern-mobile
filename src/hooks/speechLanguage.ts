/**
 * Persistent language preference for Web Speech API.
 *
 * Stored separately from React state so ChatInput and SettingsPage can
 * both read/write without a shared store. Defaults to navigator.language
 * on first use.
 */

const STORAGE_KEY = 'stm:speech-lang';

/** Common BCP-47 language tags, shown in the settings dropdown. */
export const SPEECH_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'zh-TW', label: 'Chinese (Taiwan)' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'pl-PL', label: 'Polish' },
  { code: 'tr-TR', label: 'Turkish' },
];

export function getSpeechLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

export function setSpeechLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}
