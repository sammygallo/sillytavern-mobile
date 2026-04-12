// Module-level callback bridge for STscript UI operations.
// ChatView registers its callbacks on mount; the executor reads them.

import type { ToastVariant } from './types';

export interface UICallbacks {
  showToast: (message: string, variant?: ToastVariant) => void;
  setInputText: (text: string) => void;
  showPopup: (message: string, buttons?: string[]) => Promise<string>;
  showInputPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  navigate: (path: string) => void;
}

const noop = () => {};
const noopAsync = async () => '' as string;
const noopAsyncNull = async () => null as string | null;
const noopNavigate = () => {};

let callbacks: UICallbacks = {
  showToast: noop,
  setInputText: noop,
  showPopup: noopAsync,
  showInputPrompt: noopAsyncNull,
  navigate: noopNavigate,
};

export function registerUICallbacks(cbs: Partial<UICallbacks>): void {
  callbacks = { ...callbacks, ...cbs };
}

export function getUICallbacks(): UICallbacks {
  return callbacks;
}
