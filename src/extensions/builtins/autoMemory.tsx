/**
 * Auto-Memory extension — periodic LLM extraction of canonical facts
 * appended to a per-character auto-memory lorebook.
 *
 * Settings UI lives here; trigger logic lives in ChatView (mirrors the
 * summarize extension).
 */
import { Brain, Loader2 } from 'lucide-react';
import { extensionRegistry } from '../registry';
import { useAutoMemoryStore } from '../../stores/autoMemoryStore';
import type { ExtensionManifest } from '../types';

function AutoMemorySettings() {
  const enabled = useAutoMemoryStore((s) => s.enabled);
  const triggerEvery = useAutoMemoryStore((s) => s.triggerEvery);
  const isExtracting = useAutoMemoryStore((s) => s.isExtracting);
  const error = useAutoMemoryStore((s) => s.error);
  const setEnabled = useAutoMemoryStore((s) => s.setEnabled);
  const setTriggerEvery = useAutoMemoryStore((s) => s.setTriggerEvery);

  const inputClass =
    'px-2 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]';
  const labelClass =
    'flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2';

  return (
    <div className="space-y-3">
      <div className={labelClass}>
        <span>Auto-extract facts</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          disabled={isExtracting}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={labelClass}>
        <span>Trigger every N messages</span>
        <input
          type="number"
          min={10}
          max={200}
          value={triggerEvery}
          onChange={(e) => setTriggerEvery(parseInt(e.target.value, 10))}
          className={`${inputClass} w-16 text-center`}
        />
      </div>

      <p className="text-[10px] text-[var(--color-text-secondary)]/70 leading-relaxed">
        Periodically asks the active model to extract canonical facts from
        recent chat turns and appends them to a per-character lorebook
        (named "{'{Character} — Auto Memory'}"). Costs one LLM call per
        trigger; uses your active provider/model.
      </p>

      {isExtracting && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <Loader2 size={12} className="animate-spin" />
          <span>Extracting facts...</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

const manifest: ExtensionManifest = {
  id: 'autoMemory',
  displayName: 'Auto-Memory',
  description:
    'Periodically extract canonical facts from chat into a per-character lorebook, growing persistent memory automatically.',
  version: '1.0.0',
  icon: Brain,
  defaultEnabled: false,
  settingsPanel: AutoMemorySettings,
};

extensionRegistry.register(manifest);
