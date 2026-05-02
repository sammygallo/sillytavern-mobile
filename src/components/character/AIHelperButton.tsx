import { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { showToastGlobal } from '../ui/Toast';
import {
  runAIHelperAction,
  type AIHelperAction,
  type CharacterFieldsSnapshot,
} from '../../utils/aiCharacterHelper';

interface AIHelperButtonProps {
  field: keyof CharacterFieldsSnapshot;
  /** Latest snapshot of every field. The component reads its own field's
   *  value from here and passes the rest as context for "Suggest". */
  fields: CharacterFieldsSnapshot;
  /** Called with the AI's output to overwrite the field's current value. */
  onResult: (text: string) => void;
}

const ACTION_LABELS: Record<AIHelperAction, string> = {
  polish: 'Polish',
  reformat: 'Reformat',
  suggest: 'Suggest from other fields',
};

const ACTION_DESCRIPTIONS: Record<AIHelperAction, string> = {
  polish: 'Smooth grammar and prose, keep meaning',
  reformat: 'Restructure into prompt-friendly form',
  suggest: 'Draft this field using the rest of the profile',
};

export function AIHelperButton({ field, fields, onResult }: AIHelperButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AIHelperAction | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the menu when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function run(action: AIHelperAction) {
    setOpen(false);
    setBusy(action);
    try {
      const result = await runAIHelperAction(action, field, fields);
      if (result) {
        onResult(result);
        showToastGlobal(`AI ${ACTION_LABELS[action].toLowerCase()} done`, 'success');
      } else {
        showToastGlobal('AI returned an empty response', 'warning');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI helper failed';
      showToastGlobal(msg, 'error');
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isBusy}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        title="AI helper"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        <span>{isBusy ? ACTION_LABELS[busy!] + '…' : 'AI'}</span>
      </button>
      {open && !isBusy && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-20 min-w-[14rem] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden"
        >
          {(Object.keys(ACTION_LABELS) as AIHelperAction[]).map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => run(action)}
              className="w-full text-left px-3 py-2 hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <div className="text-sm text-[var(--color-text-primary)]">
                {ACTION_LABELS[action]}
              </div>
              <div className="text-[11px] text-[var(--color-text-secondary)]/70">
                {ACTION_DESCRIPTIONS[action]}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
