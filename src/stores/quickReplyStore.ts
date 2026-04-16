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

export interface QuickReplyEntry {
  id: string;
  label: string;
  message: string;
}

export interface QuickReplySet {
  id: string;
  name: string;
  entries: QuickReplyEntry[];
}

interface QuickReplyState {
  sets: QuickReplySet[];
  activeSetId: string | null;

  setActiveSet: (id: string | null) => void;

  createSet: (name: string) => string;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;

  addEntry: (setId: string, label: string, message: string) => void;
  updateEntry: (setId: string, entryId: string, label: string, message: string) => void;
  deleteEntry: (setId: string, entryId: string) => void;
  moveEntryUp: (setId: string, entryId: string) => void;
  moveEntryDown: (setId: string, entryId: string) => void;
  initForUser: (handle: string) => void;
  resetUser: () => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useQuickReplyStore = create<QuickReplyState>()(
  persist(
    (set) => ({
      sets: [],
      activeSetId: null,

      setActiveSet: (id) => set({ activeSetId: id }),

      createSet: (name) => {
        const id = uid();
        set((s) => ({ sets: [...s.sets, { id, name: name.trim() || 'New Set', entries: [] }] }));
        return id;
      },

      renameSet: (id, name) =>
        set((s) => ({
          sets: s.sets.map((qs) =>
            qs.id === id ? { ...qs, name: name.trim() || qs.name } : qs
          ),
        })),

      deleteSet: (id) =>
        set((s) => ({
          sets: s.sets.filter((qs) => qs.id !== id),
          activeSetId: s.activeSetId === id ? null : s.activeSetId,
        })),

      addEntry: (setId, label, message) =>
        set((s) => ({
          sets: s.sets.map((qs) =>
            qs.id === setId
              ? {
                  ...qs,
                  entries: [
                    ...qs.entries,
                    { id: uid(), label: label.trim(), message },
                  ],
                }
              : qs
          ),
        })),

      updateEntry: (setId, entryId, label, message) =>
        set((s) => ({
          sets: s.sets.map((qs) =>
            qs.id === setId
              ? {
                  ...qs,
                  entries: qs.entries.map((e) =>
                    e.id === entryId ? { ...e, label: label.trim(), message } : e
                  ),
                }
              : qs
          ),
        })),

      deleteEntry: (setId, entryId) =>
        set((s) => ({
          sets: s.sets.map((qs) =>
            qs.id === setId
              ? { ...qs, entries: qs.entries.filter((e) => e.id !== entryId) }
              : qs
          ),
        })),

      moveEntryUp: (setId, entryId) =>
        set((s) => ({
          sets: s.sets.map((qs) => {
            if (qs.id !== setId) return qs;
            const idx = qs.entries.findIndex((e) => e.id === entryId);
            if (idx <= 0) return qs;
            const entries = [...qs.entries];
            [entries[idx - 1], entries[idx]] = [entries[idx], entries[idx - 1]];
            return { ...qs, entries };
          }),
        })),

      moveEntryDown: (setId, entryId) =>
        set((s) => ({
          sets: s.sets.map((qs) => {
            if (qs.id !== setId) return qs;
            const idx = qs.entries.findIndex((e) => e.id === entryId);
            if (idx < 0 || idx >= qs.entries.length - 1) return qs;
            const entries = [...qs.entries];
            [entries[idx], entries[idx + 1]] = [entries[idx + 1], entries[idx]];
            return { ...qs, entries };
          }),
        })),
      initForUser: (handle) => {
        _currentHandle = handle;
        useQuickReplyStore.persist.rehydrate();
      },
      resetUser: () => {
        _currentHandle = null;
        set({ sets: [], activeSetId: null });
      },
    }),
    {
      name: 'quick-reply-store',
      storage: createJSONStorage(() => scopedLocalStorage),
    }
  )
);
