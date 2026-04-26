import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortraitAnchors } from '../components/chat/LivePortrait';

/**
 * Per-character animation anchors for the LivePortrait feature.
 *
 * Keyed by the character's avatar filename (e.g., "Mina Hope.png"), which is
 * the stable per-character identifier this codebase uses everywhere — there's
 * no separate `id` field on `Character`. Persisted to localStorage so the
 * one-time click-to-place setup survives reloads.
 */

interface LivePortraitState {
  /** Anchors keyed by character avatar filename. Missing entry = not set up yet. */
  anchorsByAvatar: Record<string, PortraitAnchors>;
  /** Global on/off — disables the feature everywhere when false. */
  enabled: boolean;

  setAnchors: (avatar: string, anchors: PortraitAnchors) => void;
  clearAnchors: (avatar: string) => void;
  getAnchors: (avatar: string) => PortraitAnchors | null;
  setEnabled: (enabled: boolean) => void;
}

export const useLivePortraitStore = create<LivePortraitState>()(
  persist(
    (set, get) => ({
      anchorsByAvatar: {},
      enabled: true,

      setAnchors(avatar, anchors) {
        set((s) => ({
          anchorsByAvatar: { ...s.anchorsByAvatar, [avatar]: anchors },
        }));
      },

      clearAnchors(avatar) {
        set((s) => {
          const next = { ...s.anchorsByAvatar };
          delete next[avatar];
          return { anchorsByAvatar: next };
        });
      },

      getAnchors(avatar) {
        return get().anchorsByAvatar[avatar] ?? null;
      },

      setEnabled(enabled) {
        set({ enabled });
      },
    }),
    {
      name: 'live-portrait',
      version: 1,
    },
  ),
);
