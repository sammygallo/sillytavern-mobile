/**
 * AISettingsPage — placeholder that re-renders the main SettingsPage
 * scrolled to the AI provider section. In the current architecture,
 * AI settings (provider, model, API keys, connection profiles) live
 * inline in SettingsPage. This stub allows the panel to reference 'ai'
 * as a page and simply renders SettingsPage.
 */
import { SettingsPage } from './SettingsPage';

export function AISettingsPage(_props: { params?: Record<string, string> }) {
  return <SettingsPage />;
}
