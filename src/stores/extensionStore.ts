import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ExtensionState {
  /** Per-extension enabled state. Keys are extension IDs (e.g. 'tts', 'summarize'). */
  enabled: Record<string, boolean>;
  setEnabled: (id: string, on: boolean) => void;
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set) => ({
      enabled: {},
      setEnabled: (id, on) =>
        set((s) => ({ enabled: { ...s.enabled, [id]: on } })),
    }),
    { name: 'st-mobile-extensions' }
  )
);
