import { create } from 'zustand';

export const TOTAL_STEPS = 6;

const STORAGE_KEY = 'sillytavern_onboarding_completed';

interface OnboardingState {
  isOpen: boolean;
  isDocked: boolean;
  currentStep: number;
  hasCompleted: boolean;

  start: () => void;
  nextStep: () => void;
  prevStep: () => void;
  complete: () => void;
  skip: () => void;
  dock: () => void;
  returnFromDock: (advance?: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  isOpen: false,
  isDocked: false,
  currentStep: 0,
  hasCompleted: localStorage.getItem(STORAGE_KEY) === 'true',

  start: () => set({ isOpen: true, isDocked: false, currentStep: 0 }),

  nextStep: () => {
    const { currentStep, complete } = get();
    if (currentStep >= TOTAL_STEPS - 1) {
      complete();
    } else {
      set({ currentStep: currentStep + 1, isOpen: true, isDocked: false });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },

  complete: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    set({ isOpen: false, isDocked: false, currentStep: 0, hasCompleted: true });
  },

  skip: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    set({ isOpen: false, isDocked: false, currentStep: 0, hasCompleted: true });
  },

  dock: () => set({ isOpen: false, isDocked: true }),

  returnFromDock: (advance = true) => {
    set({ isDocked: false, isOpen: true });
    if (advance) get().nextStep();
  },
}));
