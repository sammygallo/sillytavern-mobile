import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ExtensionId = 'tts' | 'imageGen' | 'translate' | 'summarize';

interface ExtensionState {
  enabled: Record<ExtensionId, boolean>;
  setEnabled: (id: ExtensionId, on: boolean) => void;
}

const DEFAULTS: Record<ExtensionId, boolean> = {
  tts: true,
  imageGen: true,
  translate: true,
  summarize: false,
};

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set) => ({
      enabled: { ...DEFAULTS },
      setEnabled: (id, on) =>
        set((s) => ({ enabled: { ...s.enabled, [id]: on } })),
    }),
    { name: 'st-mobile-extensions' }
  )
);
