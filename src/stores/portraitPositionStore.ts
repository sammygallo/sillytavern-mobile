import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Per-character object-position values for the mobile portrait panel.
 * Values are CSS percentages (0-100) on each axis. Default of 50/0 matches
 * the original `object-cover object-top` behavior.
 */

export interface PortraitPosition {
  x: number;
  y: number;
}

const DEFAULT_POSITION: PortraitPosition = { x: 50, y: 0 };

interface PortraitPositionState {
  positionsByAvatar: Record<string, PortraitPosition>;
  getPosition: (avatar: string) => PortraitPosition;
  setPosition: (avatar: string, pos: PortraitPosition) => void;
  resetPosition: (avatar: string) => void;
}

export const usePortraitPositionStore = create<PortraitPositionState>()(
  persist(
    (set, get) => ({
      positionsByAvatar: {},

      getPosition(avatar) {
        return get().positionsByAvatar[avatar] ?? DEFAULT_POSITION;
      },

      setPosition(avatar, pos) {
        set((s) => ({
          positionsByAvatar: { ...s.positionsByAvatar, [avatar]: pos },
        }));
      },

      resetPosition(avatar) {
        set((s) => {
          const next = { ...s.positionsByAvatar };
          delete next[avatar];
          return { positionsByAvatar: next };
        });
      },
    }),
    { name: 'portrait-position', version: 1 },
  ),
);
