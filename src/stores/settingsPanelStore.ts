import { create } from 'zustand';

export type SettingsPageId =
  | 'main'
  | 'ai'
  | 'generation'
  | 'prompts'
  | 'worldinfo'
  | 'regex'
  | 'invitations'
  | 'users'
  | 'characters'
  | 'quickreplies'
  | 'extensions'
  | 'databank'
  | 'gallery'
  | 'themes';

export interface SettingsStackEntry {
  page: SettingsPageId;
  params?: Record<string, string>;
}

interface SettingsPanelState {
  isOpen: boolean;
  pageStack: SettingsStackEntry[];

  open: () => void;
  close: () => void;
  pushPage: (page: SettingsPageId, params?: Record<string, string>) => void;
  goBack: () => void;
  currentPage: () => SettingsStackEntry;
}

export const useSettingsPanelStore = create<SettingsPanelState>((set, get) => ({
  isOpen: false,
  pageStack: [{ page: 'main' }],

  open: () => set({ isOpen: true, pageStack: [{ page: 'main' }] }),

  close: () => set({ isOpen: false, pageStack: [{ page: 'main' }] }),

  pushPage: (page, params) =>
    set((state) => ({
      pageStack: [...state.pageStack, { page, params }],
    })),

  goBack: () => {
    const { pageStack } = get();
    if (pageStack.length <= 1) {
      set({ isOpen: false, pageStack: [{ page: 'main' }] });
    } else {
      set({ pageStack: pageStack.slice(0, -1) });
    }
  },

  currentPage: () => {
    const { pageStack } = get();
    return pageStack[pageStack.length - 1];
  },
}));
