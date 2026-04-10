import { FileText, Loader2 } from 'lucide-react';
import { extensionRegistry } from '../registry';
import { useSummarizeStore } from '../../stores/summarizeStore';
import type { ExtensionManifest, ContextBuildEvent, ContextContribution } from '../types';

// ---------------------------------------------------------------------------
// Settings panel (rendered inside the extension card)
// ---------------------------------------------------------------------------

function SummarizeSettings() {
  const autoSummarize = useSummarizeStore((s) => s.autoSummarize);
  const autoTriggerEvery = useSummarizeStore((s) => s.autoTriggerEvery);
  const injectionDepth = useSummarizeStore((s) => s.injectionDepth);
  const injectionRole = useSummarizeStore((s) => s.injectionRole);
  const isGenerating = useSummarizeStore((s) => s.isGenerating);
  const setAutoSummarize = useSummarizeStore((s) => s.setAutoSummarize);
  const setAutoTriggerEvery = useSummarizeStore((s) => s.setAutoTriggerEvery);
  const setInjectionDepth = useSummarizeStore((s) => s.setInjectionDepth);
  const setInjectionRole = useSummarizeStore((s) => s.setInjectionRole);

  const inputClass =
    'px-2 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]';
  const labelClass =
    'flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2';

  return (
    <div className="space-y-3">
      <div className={labelClass}>
        <span>Auto-summarize</span>
        <button
          type="button"
          role="switch"
          aria-checked={autoSummarize}
          onClick={() => setAutoSummarize(!autoSummarize)}
          disabled={isGenerating}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            autoSummarize ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              autoSummarize ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={labelClass}>
        <span>Trigger every N messages</span>
        <input
          type="number"
          min={5}
          max={100}
          value={autoTriggerEvery}
          onChange={(e) => setAutoTriggerEvery(parseInt(e.target.value, 10))}
          className={`${inputClass} w-16 text-center`}
        />
      </div>

      <div className={labelClass}>
        <span>
          Injection depth
          <span className="block text-[10px] text-[var(--color-text-secondary)]/60">
            Messages from end (999 = before all history)
          </span>
        </span>
        <input
          type="number"
          min={0}
          max={999}
          value={injectionDepth}
          onChange={(e) => setInjectionDepth(parseInt(e.target.value, 10))}
          className={`${inputClass} w-16 text-center`}
        />
      </div>

      <div className={labelClass}>
        <span>Injection role</span>
        <select
          value={injectionRole}
          onChange={(e) => setInjectionRole(e.target.value as 'system' | 'user')}
          className={inputClass}
        >
          <option value="system">System</option>
          <option value="user">User</option>
        </select>
      </div>

      {isGenerating && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <Loader2 size={12} className="animate-spin" />
          <span>Generating summary...</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context hook — injects the cached summary into the prompt
// ---------------------------------------------------------------------------

function onBuildContext(event: ContextBuildEvent): ContextContribution[] {
  const { injectionDepth, injectionRole, getSummary } = useSummarizeStore.getState();
  const summary = getSummary(event.currentChatFile);
  if (!summary?.text) return [];

  return [
    {
      content: `[Summary of previous events: ${summary.text}]`,
      role: injectionRole,
      position: 'at_depth',
      depth: injectionDepth,
      order: 50, // before other at_depth contributions
    },
  ];
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const manifest: ExtensionManifest = {
  id: 'summarize',
  displayName: 'Summarization',
  description:
    'Condense long conversations into a summary injected into the AI\'s context, preventing memory loss over long chats.',
  version: '1.0.0',
  icon: FileText,
  defaultEnabled: false,
  onBuildContext,
  settingsPanel: SummarizeSettings,
};

extensionRegistry.register(manifest);
