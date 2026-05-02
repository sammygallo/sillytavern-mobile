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

interface ExpressionsState {
  /** When true, keep the previous valid expression instead of falling back to the default avatar when a sprite is missing. */
  noFallback: boolean;
  setNoFallback: (on: boolean) => void;
  initForUser: (handle: string) => void;
  resetUser: () => void;
}

export const useExpressionsStore = create<ExpressionsState>()(
  persist(
    (set) => ({
      noFallback: false,
      setNoFallback: (on) => set({ noFallback: on }),
      initForUser: (handle) => {
        _currentHandle = handle;
        useExpressionsStore.persist.rehydrate();
      },
      resetUser: () => {
        _currentHandle = null;
        set({ noFallback: false });
      },
    }),
    {
      name: 'st-mobile-expressions',
      storage: createJSONStorage(() => scopedLocalStorage),
    }
  )
);
