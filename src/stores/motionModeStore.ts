import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MotionMode = 'auto' | 'none' | 'expressions' | 'liveportrait';

interface MotionModeState {
  modesByAvatar: Record<string, MotionMode>;
  setMode: (avatar: string, mode: MotionMode) => void;
  getMode: (avatar: string) => MotionMode;
}

export const useMotionModeStore = create<MotionModeState>()(
  persist(
    (set, get) => ({
      modesByAvatar: {},
      setMode(avatar, mode) {
        set((s) => ({ modesByAvatar: { ...s.modesByAvatar, [avatar]: mode } }));
      },
      getMode(avatar) {
        return get().modesByAvatar[avatar] ?? 'auto';
      },
    }),
    { name: 'st-mobile-motion-mode', version: 1 },
  ),
);

export type ResolvedMotionMode = 'none' | 'expressions' | 'liveportrait';

export function resolveMotionMode(
  mode: MotionMode,
  hasLivePortraitClips: boolean,
  hasExpressionSprites: boolean,
): ResolvedMotionMode {
  if (mode === 'auto') {
    if (hasLivePortraitClips) return 'liveportrait';
    if (hasExpressionSprites) return 'expressions';
    return 'none';
  }
  if (mode === 'liveportrait') return hasLivePortraitClips ? 'liveportrait' : 'none';
  if (mode === 'expressions') return hasExpressionSprites ? 'expressions' : 'none';
  return 'none';
}
