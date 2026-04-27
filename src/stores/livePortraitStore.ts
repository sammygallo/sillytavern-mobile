import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Per-character animated-clip URLs for the Live Portrait feature.
 *
 * Keyed by the character's avatar filename (e.g., "Mina Hope.png"), which is
 * the stable per-character identifier this codebase uses everywhere — there's
 * no separate `id` field on `Character`. Persisted to localStorage so the
 * one-time clip generation survives reloads.
 *
 * Each character's value is a map from emotion name (`idle`, `happy`,
 * `sad`, `angry`, `surprised`, `neutral`) to a server-relative URL like
 * `/characters/Mina Hope/live/idle.mp4`. The browser plays these via a
 * `<video>` tag in the chat avatar slot.
 */

export type EmotionClips = Record<string, string>;

interface LivePortraitState {
  /** Generated clip URLs keyed by character avatar filename. */
  clipsByAvatar: Record<string, EmotionClips>;
  /** Global on/off — disables the feature everywhere when false. */
  enabled: boolean;

  setClips: (avatar: string, clips: EmotionClips) => void;
  clearClips: (avatar: string) => void;
  getClips: (avatar: string) => EmotionClips | null;
  setEnabled: (enabled: boolean) => void;
}

export const useLivePortraitStore = create<LivePortraitState>()(
  persist(
    (set, get) => ({
      clipsByAvatar: {},
      enabled: true,

      setClips(avatar, clips) {
        set((s) => ({
          clipsByAvatar: { ...s.clipsByAvatar, [avatar]: clips },
        }));
      },

      clearClips(avatar) {
        set((s) => {
          const next = { ...s.clipsByAvatar };
          delete next[avatar];
          return { clipsByAvatar: next };
        });
      },

      getClips(avatar) {
        return get().clipsByAvatar[avatar] ?? null;
      },

      setEnabled(enabled) {
        set({ enabled });
      },
    }),
    {
      name: 'live-portrait',
      version: 2,
      // Bumped from v1 (which stored anchors for the mesh-warp approach).
      // Old anchor data is silently dropped — users will need to regenerate
      // clips in the new UI.
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== 'object') {
          return { clipsByAvatar: {}, enabled: true };
        }
        return { clipsByAvatar: {}, enabled: (persisted as { enabled?: boolean }).enabled ?? true };
      },
    },
  ),
);
