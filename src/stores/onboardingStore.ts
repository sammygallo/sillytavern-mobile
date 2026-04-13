import { create } from 'zustand';

export const TOTAL_STEPS = 5;

const STORAGE_KEY = 'sillytavern_onboarding_completed';

interface OnboardingState {
  isOpen: boolean;
  currentStep: number;
  hasCompleted: boolean;

  start: () => void;
  nextStep: () => void;
  prevStep: () => void;
  complete: () => void;
  skip: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  hasCompleted: localStorage.getItem(STORAGE_KEY) === 'true',

  start: () => set({ isOpen: true, currentStep: 0 }),

  nextStep: () => {
    const { currentStep, complete } = get();
    if (currentStep >= TOTAL_STEPS - 1) {
      complete();
    } else {
      set({ currentStep: currentStep + 1 });
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
    set({ isOpen: false, currentStep: 0, hasCompleted: true });
  },

  skip: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    set({ isOpen: false, currentStep: 0, hasCompleted: true });
  },
}));
