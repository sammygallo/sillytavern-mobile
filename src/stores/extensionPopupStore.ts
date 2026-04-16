import { create } from 'zustand';

/**
 * SillyTavern popup type constants — mirror the integer values upstream uses
 * so extensions calling `callPopup(html, 2, ...)` keep working.
 */
export const POPUP_TYPE = {
  TEXT: 1,
  CONFIRM: 2,
  INPUT: 3,
  DISPLAY: 4,
} as const;

export type PopupType = 1 | 2 | 3 | 4;

export interface PopupOptions {
  okButton?: string;
  cancelButton?: string;
  wide?: boolean;
  large?: boolean;
  rows?: number;
  allowVerticalScrolling?: boolean;
}

export interface PopupRequest {
  id: string;
  html: string;
  type: PopupType;
  inputValue?: string;
  options?: PopupOptions;
  resolve: (result: unknown) => void;
}

interface ExtensionPopupState {
  popups: PopupRequest[];
  showPopup: (
    html: string,
    type: PopupType,
    inputValue?: string,
    options?: PopupOptions,
  ) => Promise<unknown>;
  closePopup: (id: string, result: unknown) => void;
}

let _seq = 0;

export const useExtensionPopupStore = create<ExtensionPopupState>((set, get) => ({
  popups: [],
  showPopup(html, type, inputValue, options) {
    return new Promise((resolve) => {
      const id = `popup_${++_seq}`;
      set((s) => ({
        popups: [...s.popups, { id, html, type, inputValue, options, resolve }],
      }));
    });
  },
  closePopup(id, result) {
    const popup = get().popups.find((p) => p.id === id);
    if (!popup) return;
    popup.resolve(result);
    set((s) => ({ popups: s.popups.filter((p) => p.id !== id) }));
  },
}));
