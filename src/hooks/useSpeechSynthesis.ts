import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTtsVoiceUri,
  getTtsRate,
  getTtsPitch,
} from './speechLanguage';

/**
 * React hook wrapping the browser SpeechSynthesis API.
 *
 * - Feature-detects `window.speechSynthesis`; returns `isSupported = false`
 *   when unavailable so callers can hide TTS controls.
 * - Handles Chrome's async voice loading (`onvoiceschanged`).
 * - Only one utterance plays at a time — calling `speak()` while another
 *   utterance is active cancels the previous one first.
 */

// ---------------------------------------------------------------------------
// Singleton playing-message tracker so only one message plays across all
// mounted ChatMessage instances (each gets its own hook instance).
// ---------------------------------------------------------------------------

type PlayingListener = (id: string | null) => void;

let _currentlyPlaying: string | null = null;
const _listeners = new Set<PlayingListener>();

function setCurrentlyPlaying(id: string | null) {
  _currentlyPlaying = id;
  _listeners.forEach((fn) => fn(id));
}

function subscribeCurrentlyPlaying(fn: PlayingListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSpeechSynthesisReturn {
  /** Whether the browser supports the SpeechSynthesis API. */
  isSupported: boolean;
  /** Available TTS voices (populated async on Chrome). */
  voices: SpeechSynthesisVoice[];
  /** Whether this particular message is currently being spoken. */
  isSpeaking: boolean;
  /** Begin speaking `text`. Cancels any other active utterance first. */
  speak: (text: string, messageId: string) => void;
  /** Stop speaking (if this message is the one playing). */
  stop: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSupported] = useState<boolean>(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Track which message *this* instance is speaking.
  const activeIdRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // --- Voice list (Chrome loads async) ---
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  // --- Subscribe to singleton playing tracker ---
  useEffect(() => {
    return subscribeCurrentlyPlaying((id) => {
      if (activeIdRef.current && id !== activeIdRef.current) {
        // Another message started — this one is no longer playing.
        activeIdRef.current = null;
        utteranceRef.current = null;
        setIsSpeaking(false);
      }
    });
  }, []);

  // Cleanup on unmount — cancel if this hook's utterance is active.
  useEffect(() => {
    return () => {
      if (activeIdRef.current && _currentlyPlaying === activeIdRef.current) {
        speechSynthesis.cancel();
        setCurrentlyPlaying(null);
      }
    };
  }, []);

  // --- Resolve the preferred voice ---
  const resolveVoice = useCallback(
    (availableVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
      if (availableVoices.length === 0) return null;

      const preferredUri = getTtsVoiceUri();
      if (preferredUri) {
        const match = availableVoices.find((v) => v.voiceURI === preferredUri);
        if (match) return match;
      }

      // Fallback: first voice matching navigator.language
      const lang = navigator.language ?? 'en-US';
      const langMatch = availableVoices.find((v) => v.lang.startsWith(lang.split('-')[0]));
      return langMatch ?? availableVoices[0];
    },
    []
  );

  const speak = useCallback(
    (text: string, messageId: string) => {
      if (!isSupported) return;

      // If this same message is already playing, treat as a toggle → stop.
      if (activeIdRef.current === messageId) {
        speechSynthesis.cancel();
        activeIdRef.current = null;
        utteranceRef.current = null;
        setIsSpeaking(false);
        setCurrentlyPlaying(null);
        return;
      }

      // Cancel whatever was playing (could be another message).
      speechSynthesis.cancel();

      // Strip common RP formatting (* * and {{ }}) for cleaner speech.
      const clean = text
        .replace(/\{\{([^}]*)\}\}/g, '$1')
        .replace(/\*([^*]*)\*/g, '$1')
        .replace(/_([^_]*)_/g, '$1')
        .trim();

      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);

      // Apply user preferences
      const currentVoices = speechSynthesis.getVoices();
      const voice = resolveVoice(currentVoices.length > 0 ? currentVoices : voices);
      if (voice) utterance.voice = voice;
      utterance.rate = getTtsRate();
      utterance.pitch = getTtsPitch();

      utterance.onend = () => {
        if (activeIdRef.current === messageId) {
          activeIdRef.current = null;
          utteranceRef.current = null;
          setIsSpeaking(false);
          setCurrentlyPlaying(null);
        }
      };

      utterance.onerror = (ev) => {
        // 'canceled' fires from our own cancel() call — not an error.
        if (ev.error === 'canceled') return;
        if (activeIdRef.current === messageId) {
          activeIdRef.current = null;
          utteranceRef.current = null;
          setIsSpeaking(false);
          setCurrentlyPlaying(null);
        }
      };

      activeIdRef.current = messageId;
      utteranceRef.current = utterance;
      setIsSpeaking(true);
      setCurrentlyPlaying(messageId);
      speechSynthesis.speak(utterance);
    },
    [isSupported, voices, resolveVoice]
  );

  const stop = useCallback(() => {
    if (activeIdRef.current) {
      speechSynthesis.cancel();
      activeIdRef.current = null;
      utteranceRef.current = null;
      setIsSpeaking(false);
      setCurrentlyPlaying(null);
    }
  }, []);

  return { isSupported, voices, isSpeaking, speak, stop };
}

// ---------------------------------------------------------------------------
// Standalone helpers for auto-read (used by ChatView, not per-message)
// ---------------------------------------------------------------------------

/**
 * Speak text immediately using current TTS preferences.
 * Cancels any existing utterance first.
 */
export function speakText(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const clean = text
    .replace(/\{\{([^}]*)\}\}/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .trim();
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);

  const voices = speechSynthesis.getVoices();
  const preferredUri = getTtsVoiceUri();
  if (preferredUri) {
    const match = voices.find((v) => v.voiceURI === preferredUri);
    if (match) utterance.voice = match;
  } else if (voices.length > 0) {
    const lang = navigator.language ?? 'en-US';
    const langMatch = voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
    if (langMatch) utterance.voice = langMatch;
  }

  utterance.rate = getTtsRate();
  utterance.pitch = getTtsPitch();

  // Update singleton tracker so per-message buttons know something is playing.
  setCurrentlyPlaying('__autoread__');
  utterance.onend = () => setCurrentlyPlaying(null);
  utterance.onerror = (ev) => {
    if (ev.error !== 'canceled') setCurrentlyPlaying(null);
  };

  speechSynthesis.speak(utterance);
}
