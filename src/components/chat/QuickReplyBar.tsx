import { useRef } from 'react';
import { useQuickReplyStore } from '../../stores/quickReplyStore';

interface QuickReplyBarProps {
  onPrefill: (text: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
}

const LONG_PRESS_MS = 400;

export function QuickReplyBar({ onPrefill, onSend, disabled = false }: QuickReplyBarProps) {
  const sets = useQuickReplyStore((s) => s.sets);
  const activeSetId = useQuickReplyStore((s) => s.activeSetId);

  const activeSet = activeSetId ? sets.find((s) => s.id === activeSetId) : null;

  if (!activeSet || activeSet.entries.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
      style={{ scrollbarWidth: 'none' }}
      aria-label="Quick replies"
    >
      {activeSet.entries.map((entry) => (
        <QuickReplyPill
          key={entry.id}
          label={entry.label}
          message={entry.message}
          onPrefill={onPrefill}
          onSend={onSend}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface PillProps {
  label: string;
  message: string;
  onPrefill: (text: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

function QuickReplyPill({ label, message, onPrefill, onSend, disabled }: PillProps) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    firedRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onSend(message);
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    clearTimer();
    if (!firedRef.current && !disabled) {
      onPrefill(message);
    }
    firedRef.current = false;
  };

  const handlePointerCancel = () => {
    clearTimer();
    firedRef.current = false;
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/40 active:scale-95 transition-all touch-none select-none disabled:opacity-40"
      title={`Tap to prefill · hold to send: ${message}`}
    >
      {label}
    </button>
  );
}
