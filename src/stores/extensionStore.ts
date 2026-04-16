import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

let _currentHandle: string | null = null;

const scopedLocalStorage = {
  getItem: (name: string) => {
    const key = _currentHandle ? `${name}_${_currentHandle}` : name;
    return localStorage.getItem(key);
  },
  setItem: (name: string, value: string) => {
    const key = _currentHandle ? `${name}_${_currentHandle}` : name;
    localStorage.setItem(key, value);
  },
  removeItem: (name: string) => {
    const key = _currentHandle ? `${name}_${_currentHandle}` : name;
    localStorage.removeItem(key);
  },
};

interface ExtensionState {
  /** Per-extension enabled state. Keys are extension IDs (e.g. 'tts', 'summarize'). */
  enabled: Record<string, boolean>;
  setEnabled: (id: string, on: boolean) => void;
  initForUser: (handle: string) => void;
  resetUser: () => void;
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set) => ({
      enabled: {},
      setEnabled: (id, on) =>
        set((s) => ({ enabled: { ...s.enabled, [id]: on } })),
      initForUser: (handle) => {
        _currentHandle = handle;
        useExtensionStore.persist.rehydrate();
      },
      resetUser: () => {
        _currentHandle = null;
        set({ enabled: {} });
      },
    }),
    {
      name: 'st-mobile-extensions',
      storage: createJSONStorage(() => scopedLocalStorage),
    }
  )
);
