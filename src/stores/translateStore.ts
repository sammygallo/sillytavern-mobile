import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translateText, type TranslateProvider } from '../api/translateApi';

interface TranslateState {
  // Persisted settings
  provider: TranslateProvider;
  targetLang: string;

  // Session state (not persisted)
  cache: Map<string, string>;   // messageId → translated text
  pending: Set<string>;         // messageIds currently being fetched
  visible: Set<string>;         // messageIds with translation panel open

  setProvider: (p: TranslateProvider) => void;
  setTargetLang: (l: string) => void;
  /** Toggle the translation panel for a message. Fetches from API if not cached. */
  toggleTranslation: (messageId: string, text: string) => Promise<void>;
}

export const useTranslateStore = create<TranslateState>()(
  persist(
    (set, get) => ({
      provider: 'google',
      targetLang: 'en',
      cache: new Map(),
      pending: new Set(),
      visible: new Set(),

      setProvider: (p) =>
        // Changing provider invalidates all cached translations
        set({ provider: p, cache: new Map(), visible: new Set() }),

      setTargetLang: (l) =>
        // Changing target language invalidates all cached translations
        set({ targetLang: l, cache: new Map(), visible: new Set() }),

      toggleTranslation: async (messageId, text) => {
        const { visible, cache, pending, provider, targetLang } = get();

        // --- Hide ---
        if (visible.has(messageId)) {
          const next = new Set(visible);
          next.delete(messageId);
          set({ visible: next });
          return;
        }

        // Debounce: ignore if already fetching
        if (pending.has(messageId)) return;

        // --- Show from cache ---
        if (cache.has(messageId)) {
          const next = new Set(visible);
          next.add(messageId);
          set({ visible: next });
          return;
        }

        // --- Fetch then show ---
        // Add to visible immediately so the panel mounts with a loading state
        const nextPending = new Set(pending);
        nextPending.add(messageId);
        const nextVisible = new Set(visible);
        nextVisible.add(messageId);
        set({ pending: nextPending, visible: nextVisible });

        try {
          const translated = await translateText(text, targetLang, provider);
          const s = get();
          const newCache = new Map(s.cache);
          newCache.set(messageId, translated);
          const newPending = new Set(s.pending);
          newPending.delete(messageId);
          set({ cache: newCache, pending: newPending });
        } catch (err) {
          console.error('Translation failed:', err);
          const s = get();
          const newPending = new Set(s.pending);
          newPending.delete(messageId);
          const newVisible = new Set(s.visible);
          newVisible.delete(messageId);
          set({ pending: newPending, visible: newVisible });
        }
      },
    }),
    {
      name: 'st-mobile-translate',
      partialize: (state) => ({
        provider: state.provider,
        targetLang: state.targetLang,
      }),
    }
  )
);
