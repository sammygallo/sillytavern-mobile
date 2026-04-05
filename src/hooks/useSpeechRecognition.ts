import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API wrapper for browser-native speech-to-text.
 *
 * Handles feature detection, permission state, and single-shot vs push-to-talk
 * modes. Interim results stream to the caller via `interimTranscript`; the
 * final transcript arrives via `onFinalResult` when recognition ends.
 *
 * Safari < 14.1 and older Firefox lack SpeechRecognition — `isSupported`
 * will be false and the caller should hide the mic button entirely.
 */

// The Web Speech API types aren't in the stock TS DOM lib reliably across
// versions, so we declare the shape we depend on ourselves.
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error:
    | 'no-speech'
    | 'aborted'
    | 'audio-capture'
    | 'network'
    | 'not-allowed'
    | 'service-not-allowed'
    | 'bad-grammar'
    | 'language-not-supported';
  readonly message: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onerror:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void)
    | null;
  onresult:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void)
    | null;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export type PermissionState = 'unknown' | 'granted' | 'denied';

const PERMISSION_STORAGE_KEY = 'stm:speech-permission';

function loadPermissionState(): PermissionState {
  try {
    const raw = localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
  } catch {
    // ignore
  }
  return 'unknown';
}

function savePermissionState(state: PermissionState) {
  try {
    if (state === 'unknown') localStorage.removeItem(PERMISSION_STORAGE_KEY);
    else localStorage.setItem(PERMISSION_STORAGE_KEY, state);
  } catch {
    // ignore
  }
}

export interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag (e.g. 'en-US', 'ja-JP'). Defaults to navigator.language. */
  lang?: string;
  /** If true, keep listening until explicitly stopped. Default: false (single-shot). */
  continuous?: boolean;
  /** Called once with the final transcript when recognition ends normally. */
  onFinalResult?: (transcript: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Whether the browser supports Web Speech API at all. */
  isSupported: boolean;
  /** Whether recognition is currently active. */
  isListening: boolean;
  /** Live in-progress transcript (interim + final concatenated). */
  interimTranscript: string;
  /** Current mic permission state. */
  permissionState: PermissionState;
  /** Last error that occurred during recognition, if any. */
  error: string | null;
  /** Begin listening. Triggers browser mic permission prompt on first use. */
  start: () => void;
  /** Stop listening and emit final transcript via onFinalResult. */
  stop: () => void;
  /** Stop listening WITHOUT emitting final transcript (discards interim text). */
  abort: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { lang, continuous = false, onFinalResult } = options;

  const [isSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [permissionState, setPermissionState] = useState<PermissionState>(() =>
    loadPermissionState()
  );
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Track whether the most recent stop was an explicit abort so onend knows
  // not to emit the accumulated transcript.
  const abortedRef = useRef(false);
  // Accumulated final pieces across a single session (continuous mode uses
  // these; single-shot effectively just copies them once at the end).
  const finalTranscriptRef = useRef('');
  // Stable callback reference so recreating options doesn't churn the
  // recognition instance.
  const onFinalResultRef = useRef(onFinalResult);
  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  // Cleanup on unmount — abort any active session so onresult fires don't
  // reach a stale setState.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!isSupported) return;
    // Re-entrancy guard — if we're already listening, the second start()
    // would throw InvalidStateError.
    if (recognitionRef.current) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang ?? navigator.language ?? 'en-US';
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    abortedRef.current = false;
    finalTranscriptRef.current = '';
    setInterimTranscript('');
    setError(null);

    recognition.onstart = () => {
      setIsListening(true);
      // First successful start means the user granted mic permission.
      setPermissionState((prev) => {
        if (prev !== 'granted') {
          savePermissionState('granted');
          return 'granted';
        }
        return prev;
      });
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      // resultIndex points at the first NEW result; everything before it has
      // already been fed to us. We accumulate finals into the ref and rebuild
      // the live transcript as (stable finals) + (current interim).
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (result.isFinal) {
          finalTranscriptRef.current += alt.transcript;
        } else {
          interim += alt.transcript;
        }
      }
      setInterimTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' fires from our own abort() call; don't surface as an error.
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        savePermissionState('denied');
        setPermissionState('denied');
        setError('Mic access blocked — enable in browser settings');
      } else if (event.error === 'no-speech') {
        setError('No speech detected');
      } else if (event.error === 'audio-capture') {
        setError('No microphone available');
      } else if (event.error === 'network') {
        setError('Network error');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      const wasAborted = abortedRef.current;
      const finalText = finalTranscriptRef.current.trim();
      recognitionRef.current = null;
      if (!wasAborted && finalText) {
        onFinalResultRef.current?.(finalText);
      }
      setInterimTranscript('');
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start recognition'
      );
      recognitionRef.current = null;
    }
  }, [isSupported, lang, continuous]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    abortedRef.current = false;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const abort = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    abortedRef.current = true;
    try {
      recognition.abort();
    } catch {
      // ignore
    }
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    permissionState,
    error,
    start,
    stop,
    abort,
  };
}
