import { create } from 'zustand';

interface GuidesPanelState {
  isOpen: boolean;
  /** Currently displayed guide slug; null = index view. */
  slug: string | null;
  /** Optional heading id to scroll to inside the displayed guide. */
  sectionId?: string;

  open: (slug?: string, sectionId?: string) => void;
  openIndex: () => void;
  setGuide: (slug: string, sectionId?: string) => void;
  clearGuide: () => void;
  close: () => void;
}

export const useGuidesPanelStore = create<GuidesPanelState>((set) => ({
  isOpen: false,
  slug: null,
  sectionId: undefined,

  open: (slug, sectionId) =>
    set({ isOpen: true, slug: slug ?? null, sectionId }),

  openIndex: () => set({ isOpen: true, slug: null, sectionId: undefined }),

  setGuide: (slug, sectionId) => set({ slug, sectionId }),

  clearGuide: () => set({ slug: null, sectionId: undefined }),

  close: () => set({ isOpen: false }),
}));
