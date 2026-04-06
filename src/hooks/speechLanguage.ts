/**
 * Persistent language preference for Web Speech API (STT & TTS).
 *
 * Stored separately from React state so ChatInput and SettingsPage can
 * both read/write without a shared store. Defaults to navigator.language
 * on first use.
 */

const STORAGE_KEY = 'stm:speech-lang';
const TTS_VOICE_KEY = 'stm:tts-voice';
const TTS_RATE_KEY = 'stm:tts-rate';
const TTS_PITCH_KEY = 'stm:tts-pitch';
const TTS_AUTOREAD_KEY = 'stm:tts-autoread';

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

// ---------------------------------------------------------------------------
// TTS preferences
// ---------------------------------------------------------------------------

/** Get the persisted TTS voice URI (or empty string for default). */
export function getTtsVoiceUri(): string {
  try {
    return localStorage.getItem(TTS_VOICE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setTtsVoiceUri(uri: string): void {
  try {
    localStorage.setItem(TTS_VOICE_KEY, uri);
  } catch {
    // ignore
  }
}

/** Get persisted TTS rate (0.5–2.0, default 1.0). */
export function getTtsRate(): number {
  try {
    const v = parseFloat(localStorage.getItem(TTS_RATE_KEY) ?? '');
    if (!Number.isNaN(v) && v >= 0.5 && v <= 2.0) return v;
  } catch {
    // ignore
  }
  return 1.0;
}

export function setTtsRate(rate: number): void {
  try {
    localStorage.setItem(TTS_RATE_KEY, String(Math.min(2, Math.max(0.5, rate))));
  } catch {
    // ignore
  }
}

/** Get persisted TTS pitch (0.5–2.0, default 1.0). */
export function getTtsPitch(): number {
  try {
    const v = parseFloat(localStorage.getItem(TTS_PITCH_KEY) ?? '');
    if (!Number.isNaN(v) && v >= 0.5 && v <= 2.0) return v;
  } catch {
    // ignore
  }
  return 1.0;
}

export function setTtsPitch(pitch: number): void {
  try {
    localStorage.setItem(TTS_PITCH_KEY, String(Math.min(2, Math.max(0.5, pitch))));
  } catch {
    // ignore
  }
}

/** Get auto-read toggle for new AI messages. */
export function getTtsAutoRead(): boolean {
  try {
    return localStorage.getItem(TTS_AUTOREAD_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTtsAutoRead(on: boolean): void {
  try {
    localStorage.setItem(TTS_AUTOREAD_KEY, on ? 'true' : 'false');
  } catch {
    // ignore
  }
}
