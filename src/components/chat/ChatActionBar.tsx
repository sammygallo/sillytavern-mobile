import { RefreshCw, ArrowRight, User, Square } from 'lucide-react';

interface ChatActionBarProps {
  onRegenerate: () => void;
  onContinue: () => void;
  onImpersonate: () => void;
  onStop: () => void;
  isSending: boolean;
  hasAiMessage: boolean;
  disabled?: boolean;
}

export function ChatActionBar({
  onRegenerate,
  onContinue,
  onImpersonate,
  onStop,
  isSending,
  hasAiMessage,
  disabled,
}: ChatActionBarProps) {
  if (isSending) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-[var(--color-border)]">
        <button
          onClick={onStop}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
        >
          <Square size={14} fill="currentColor" />
          <span>Stop</span>
        </button>
      </div>
    );
  }

  if (!hasAiMessage) return null;

  const actions = [
    { icon: RefreshCw, label: 'Regen', onClick: onRegenerate, title: 'Regenerate last response' },
    { icon: ArrowRight, label: 'Continue', onClick: onContinue, title: 'Continue last response' },
    { icon: User, label: 'Impersonate', onClick: onImpersonate, title: 'Write a reply as the user' },
  ];

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-1.5 border-t border-[var(--color-border)]">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={disabled}
            title={action.title}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Icon size={12} />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
