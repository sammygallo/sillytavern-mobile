import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExtensionStore } from '../../stores/extensionStore';
import { extensionRegistry } from '../../extensions/registry';
import type { ExtensionManifest } from '../../extensions/types';

function ExtensionCard({ ext }: { ext: ExtensionManifest }) {
  const [showSettings, setShowSettings] = useState(false);
  const enabled = useExtensionStore((s) => s.enabled[ext.id] ?? false);
  const setEnabled = useExtensionStore((s) => s.setEnabled);
  const Icon = ext.icon;
  const SettingsPanel = ext.settingsPanel;

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-[var(--color-primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{ext.displayName}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{ext.description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(ext.id, !enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {SettingsPanel && enabled && (
        <>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors border-t border-[var(--color-border)]"
          >
            <span className="flex-1 text-left">Settings</span>
            {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/40">
              <SettingsPanel />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ExtensionsPage() {
  const navigate = useNavigate();
  const extensions = extensionRegistry.getAll();

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)] px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-2 -ml-2 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} className="text-[var(--color-text-primary)]" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Extensions</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">Enable or disable built-in features</p>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-xl mx-auto">
        <p className="text-xs text-[var(--color-text-secondary)] pb-1">
          Toggle built-in extensions on or off. Disabled extensions are hidden throughout the app.
        </p>

        {extensions.map((ext) => (
          <ExtensionCard key={ext.id} ext={ext} />
        ))}
      </div>
    </div>
  );
}
