import { useState } from 'react';
import {
  ArrowLeft,
  Volume2,
  Image,
  Languages,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExtensionStore, type ExtensionId } from '../../stores/extensionStore';
import { useSummarizeStore } from '../../stores/summarizeStore';

interface ExtensionCardProps {
  id: ExtensionId;
  icon: React.ReactNode;
  name: string;
  description: string;
  settingsHint?: string;
  children?: React.ReactNode;
}

function ExtensionCard({ id, icon, name, description, settingsHint, children }: ExtensionCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const enabled = useExtensionStore((s) => s.enabled[id]);
  const setEnabled = useExtensionStore((s) => s.setEnabled);

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{name}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(id, !enabled)}
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

      {children && enabled && (
        <>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors border-t border-[var(--color-border)]"
          >
            <span className="flex-1 text-left">{settingsHint ?? 'Settings'}</span>
            {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/40">
              {children}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
  const labelClass = 'flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-2';

  return (
    <div className="space-y-3">
      {/* Auto-summarize toggle */}
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

      {/* Trigger interval */}
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

      {/* Injection depth */}
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

      {/* Injection role */}
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
          <span>Generating summary…</span>
        </div>
      )}
    </div>
  );
}

export function ExtensionsPage() {
  const navigate = useNavigate();

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
          Configure TTS voices and translation providers in the main Settings page.
        </p>

        <ExtensionCard
          id="tts"
          icon={<Volume2 size={20} className="text-[var(--color-primary)]" />}
          name="Text-to-Speech"
          description="Read AI messages aloud using your device's speech engine. Supports auto-read on new messages."
        />

        <ExtensionCard
          id="imageGen"
          icon={<Image size={20} className="text-[var(--color-primary)]" />}
          name="Image Generation"
          description="Generate images from prompts using Pollinations or a local Stable Diffusion WebUI. Images are inserted inline in chat."
        />

        <ExtensionCard
          id="translate"
          icon={<Languages size={20} className="text-[var(--color-primary)]" />}
          name="Translation"
          description="Translate AI messages to your preferred language. Tap the globe icon on any message. Configure provider and language in Settings."
        />

        <ExtensionCard
          id="summarize"
          icon={<FileText size={20} className="text-[var(--color-primary)]" />}
          name="Summarization"
          description="Condense long conversations into a summary injected into the AI's context, preventing memory loss over long chats."
          settingsHint="Configure auto-summarize and injection"
        >
          <SummarizeSettings />
        </ExtensionCard>
      </div>
    </div>
  );
}
