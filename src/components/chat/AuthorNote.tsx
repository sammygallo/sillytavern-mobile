import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { useChatStore, type AuthorNote as AuthorNoteType } from '../../stores/chatStore';

interface AuthorNoteProps {
  fileName: string;
  /** Controlled open state. When provided, removes the persistent header row. */
  isOpen?: boolean;
  onToggle?: () => void;
}

const ROLE_OPTIONS: Array<{ value: AuthorNoteType['role']; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'user', label: 'User' },
  { value: 'assistant', label: 'Assistant' },
];

const MAX_LENGTH = 2000;
const DEFAULT_NOTE: AuthorNoteType = { content: '', depth: 4, role: 'system' };

export function AuthorNote({ fileName, isOpen, onToggle }: AuthorNoteProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = isOpen !== undefined;
  const isExpanded = isControlled ? isOpen : internalExpanded;

  const note = useChatStore(
    (s) => s.authorNotes[fileName] ?? DEFAULT_NOTE
  );
  const setAuthorNote = useChatStore((s) => s.setAuthorNote);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value.slice(0, MAX_LENGTH);
      setAuthorNote(fileName, { content: value });
    },
    [fileName, setAuthorNote]
  );

  const handleDepthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isFinite(val) && val >= 0) {
        setAuthorNote(fileName, { depth: val });
      }
    },
    [fileName, setAuthorNote]
  );

  const handleRoleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const role = e.target.value as AuthorNoteType['role'];
      setAuthorNote(fileName, { role });
    },
    [fileName, setAuthorNote]
  );

  const charCount = note.content.length;
  const hasContent = charCount > 0;

  const handleToggle = isControlled
    ? onToggle ?? (() => {})
    : () => setInternalExpanded((v) => !v);

  if (isControlled && !isExpanded) return null;

  return (
    <div className="border-t border-[var(--color-border)]">
      {/* Self-managed header row — only shown in uncontrolled mode */}
      {!isControlled && (
        <button
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-bg-tertiary)] transition-colors"
          aria-expanded={isExpanded}
          aria-label="Toggle Author's Note"
        >
          <BookOpen size={14} className={hasContent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'} />
          <span className={`font-medium ${hasContent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Author's Note
          </span>
          {hasContent && (
            <span className="text-xs text-[var(--color-text-secondary)] ml-1">
              ({charCount})
            </span>
          )}
          <span className="ml-auto text-[var(--color-text-secondary)]">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
      )}

      {/* Controlled mode: always expanded, show header inline with close button */}
      {isControlled && (
        <div className="flex items-center gap-2 px-4 py-2">
          <BookOpen size={14} className={hasContent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'} />
          <span className={`text-sm font-medium flex-1 ${hasContent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Author's Note {hasContent && <span className="text-xs font-normal">({charCount})</span>}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close Author's Note"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 bg-[var(--color-bg-secondary)]">
          <textarea
            value={note.content}
            onChange={handleContentChange}
            placeholder="Write style, tone, or direction instructions here (e.g. &quot;Write in a gothic style, focus on atmosphere and tension&quot;). This text is injected into the AI prompt at the configured depth."
            className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            maxLength={MAX_LENGTH}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                Depth
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={note.depth}
                  onChange={handleDepthChange}
                  className="w-14 px-1.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-center"
                />
              </label>

              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                Role
                <select
                  value={note.role}
                  onChange={handleRoleChange}
                  className="px-1.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <span className={`text-xs ${charCount >= MAX_LENGTH ? 'text-red-400' : 'text-[var(--color-text-secondary)]'}`}>
              {charCount}/{MAX_LENGTH}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
