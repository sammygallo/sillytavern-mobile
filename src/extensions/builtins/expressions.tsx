import { Smile } from 'lucide-react';
import { extensionRegistry } from '../registry';
import { useExpressionsStore } from '../../stores/expressionsStore';
import type { ExtensionManifest } from '../types';

function ExpressionsSettings() {
  const noFallback = useExpressionsStore((s) => s.noFallback);
  const setNoFallback = useExpressionsStore((s) => s.setNoFallback);

  const labelClass =
    'flex items-start justify-between gap-3 text-xs text-[var(--color-text-secondary)]';

  return (
    <div className="space-y-3">
      <div className={labelClass}>
        <span className="flex-1">
          No fallback
          <span className="block text-[10px] text-[var(--color-text-secondary)]/60 mt-0.5">
            When a matching expression sprite isn't available, keep showing the previous expression instead of switching to the default avatar.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={noFallback}
          onClick={() => setNoFallback(!noFallback)}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
            noFallback ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              noFallback ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

const manifest: ExtensionManifest = {
  id: 'expressions',
  displayName: 'Expressions',
  description:
    'Show character expression sprites in chat based on detected emotion. Configure how missing expressions are handled.',
  version: '1.0.0',
  icon: Smile,
  defaultEnabled: true,
  settingsPanel: ExpressionsSettings,
};

extensionRegistry.register(manifest);
