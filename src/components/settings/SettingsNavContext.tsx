import { createContext, useContext } from 'react';
import type { SettingsPageId } from '../../stores/settingsPanelStore';

export interface SettingsNavActions {
  navigateToPage: (page: SettingsPageId, params?: Record<string, string>) => void;
  goBack: () => void;
  closePanel: () => void;
}

const SettingsNavContext = createContext<SettingsNavActions | null>(null);

export const SettingsNavProvider = SettingsNavContext.Provider;

export function useSettingsNav(): SettingsNavActions {
  const ctx = useContext(SettingsNavContext);
  if (!ctx) {
    throw new Error('useSettingsNav must be used within a SettingsNavProvider');
  }
  return ctx;
}
