import { create } from 'zustand';
import type { UserRole } from '../types';

const OWNERSHIP_KEY = 'sillytavern_character_ownership';

export interface OwnershipEntry {
  ownerHandle: string;
  visibility: 'global' | 'personal';
}

function loadOwnership(): Record<string, OwnershipEntry> {
  try {
    const raw = localStorage.getItem(OWNERSHIP_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveOwnership(map: Record<string, OwnershipEntry>) {
  try {
    localStorage.setItem(OWNERSHIP_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/security errors
  }
}

interface CharacterOwnershipState {
  ownershipMap: Record<string, OwnershipEntry>;

  // Mutations
  setOwner: (avatar: string, ownerHandle: string) => void;
  setVisibility: (avatar: string, visibility: 'global' | 'personal') => void;
  removeOwnership: (avatar: string) => void;

  // Queries
  getOwner: (avatar: string) => string | null;
  getVisibility: (avatar: string) => 'global' | 'personal';
  isOwnedBy: (avatar: string, handle: string) => boolean;

  // Permission helpers
  canEditCharacter: (avatar: string, userHandle: string, userRole: UserRole) => boolean;
  canDeleteCharacter: (avatar: string, userHandle: string, userRole: UserRole) => boolean;
}

export const useCharacterOwnershipStore = create<CharacterOwnershipState>((set, get) => ({
  ownershipMap: loadOwnership(),

  setOwner: (avatar, ownerHandle) => {
    const { ownershipMap } = get();
    const existing = ownershipMap[avatar];
    const updated = {
      ...ownershipMap,
      [avatar]: {
        ownerHandle,
        visibility: existing?.visibility ?? 'global' as const,
      },
    };
    saveOwnership(updated);
    set({ ownershipMap: updated });
  },

  setVisibility: (avatar, visibility) => {
    const { ownershipMap } = get();
    const existing = ownershipMap[avatar];
    if (!existing) return;
    const updated = {
      ...ownershipMap,
      [avatar]: { ...existing, visibility },
    };
    saveOwnership(updated);
    set({ ownershipMap: updated });
  },

  removeOwnership: (avatar) => {
    const { ownershipMap } = get();
    if (!ownershipMap[avatar]) return;
    const updated = { ...ownershipMap };
    delete updated[avatar];
    saveOwnership(updated);
    set({ ownershipMap: updated });
  },

  getOwner: (avatar) => {
    return get().ownershipMap[avatar]?.ownerHandle ?? null;
  },

  getVisibility: (avatar) => {
    return get().ownershipMap[avatar]?.visibility ?? 'global';
  },

  isOwnedBy: (avatar, handle) => {
    return get().ownershipMap[avatar]?.ownerHandle === handle;
  },

  canEditCharacter: (avatar, userHandle, userRole) => {
    if (userRole === 'owner') return true;
    return get().ownershipMap[avatar]?.ownerHandle === userHandle;
  },

  canDeleteCharacter: (avatar, userHandle, userRole) => {
    if (userRole === 'owner') return true;
    return get().ownershipMap[avatar]?.ownerHandle === userHandle;
  },
}));
