interface TypingIndicatorProps {
  speakerName?: string | null;
}

export function TypingIndicator({ speakerName }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 px-4 py-3 items-center">
      <div className="w-10 h-10 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0">
        <div className="flex gap-1 items-center">
          <span className="typing-dot" />
          <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
          <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
      {speakerName && (
        <span className="text-sm text-[var(--color-text-secondary)] italic truncate">
          {speakerName} is typing&hellip;
        </span>
      )}
    </div>
  );
}
