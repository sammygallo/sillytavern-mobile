import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useSummarizeStore } from '../../stores/summarizeStore';
import { useChatStore } from '../../stores/chatStore';

interface SummaryPanelProps {
  chatFile: string;
  characterName: string;
  /** Controlled open state. When provided, removes the persistent header row. */
  isOpen?: boolean;
  onToggle?: () => void;
}

export function SummaryPanel({ chatFile, characterName, isOpen, onToggle }: SummaryPanelProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = isOpen !== undefined;
  const isExpanded = isControlled ? isOpen : internalExpanded;

  const summary = useSummarizeStore((s) => s.summaries[chatFile] ?? null);
  const isGenerating = useSummarizeStore((s) => s.isGenerating);
  const error = useSummarizeStore((s) => s.error);
  const generateSummary = useSummarizeStore((s) => s.generateSummary);
  const clearSummary = useSummarizeStore((s) => s.clearSummary);
  const clearError = useSummarizeStore((s) => s.clearError);

  const messages = useChatStore((s) => s.messages);

  const handleGenerate = useCallback(() => {
    clearError();
    generateSummary(messages, chatFile, characterName);
  }, [messages, chatFile, characterName, generateSummary, clearError]);

  const handleClear = useCallback(() => {
    clearSummary(chatFile);
    if (!isControlled) setInternalExpanded(false);
    else onToggle?.();
  }, [chatFile, clearSummary, isControlled, onToggle]);

  const hasSummary = !!summary?.text;
  const generatedDate = summary
    ? new Date(summary.generatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const handleToggle = isControlled
    ? onToggle ?? (() => {})
    : () => setInternalExpanded((v) => !v);

  if (isControlled && !isExpanded) return null;

  return (
    <div className="border-t border-[var(--color-border)]">
      {/* Self-managed header — only in uncontrolled mode */}
      {!isControlled && (
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors"
          aria-expanded={isExpanded}
          aria-label="Toggle summary panel"
        >
          {isGenerating ? (
            <Loader2 size={14} className="text-[var(--color-primary)] animate-spin" />
          ) : (
            <FileText
              size={14}
              className={hasSummary ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}
            />
          )}
          <span className={`font-medium ${hasSummary ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Summary
          </span>
          {hasSummary && (
            <span className="text-xs text-[var(--color-text-secondary)] ml-1">
              ({summary.messageCount} msgs)
            </span>
          )}
          {isGenerating && (
            <span className="text-xs text-[var(--color-text-secondary)] ml-1">generating…</span>
          )}
          <span className="ml-auto text-[var(--color-text-secondary)]">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
      )}

      {/* Controlled mode: always open, show inline header with close button */}
      {isControlled && (
        <div className="flex items-center gap-2 px-4 py-2">
          {isGenerating ? (
            <Loader2 size={14} className="text-[var(--color-primary)] animate-spin" />
          ) : (
            <FileText size={14} className={hasSummary ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'} />
          )}
          <span className={`text-sm font-medium flex-1 ${hasSummary ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Summary {hasSummary && <span className="text-xs font-normal">({summary.messageCount} msgs)</span>}
            {isGenerating && <span className="text-xs font-normal ml-1">generating…</span>}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close summary panel"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 bg-[var(--color-bg-secondary)]">
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">{error}</p>
          )}

          {hasSummary ? (
            <>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Generated {generatedDate} · {summary!.messageCount} messages
              </p>
              <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                {summary!.text}
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-text-secondary)] italic">
              No summary yet. Generate one to help the AI remember long conversations.
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {hasSummary ? 'Regenerate' : 'Generate'}
            </button>

            {hasSummary && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-red-400 hover:border-red-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
