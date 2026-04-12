import { useEffect, useState, useRef } from 'react';
import type { CommandDefinition } from '../../utils/stscript/types';

interface Props {
  prefix: string | null;
  onSelect: (commandName: string) => void;
  onDismiss: () => void;
}

const MAX_VISIBLE = 6;

const CATEGORY_BADGES: Record<string, string> = {
  io: 'I/O',
  variables: 'Vars',
  flow: 'Flow',
  math: 'Math',
  generation: 'Gen',
  messages: 'Chat',
  character: 'Char',
  quickreply: 'QR',
  prompt: 'Prompt',
  text: 'Text',
  ui: 'UI',
  system: 'Sys',
};

export function CommandAutocomplete({ prefix, onSelect, onDismiss }: Props) {
  const [commands, setCommands] = useState<CommandDefinition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load commands from registry (lazy to avoid eager import)
  useEffect(() => {
    if (prefix === null) return;
    import('../../utils/stscript').then(({ getAllCommands }) => {
      setCommands(getAllCommands());
    });
  }, [prefix !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selection when prefix changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [prefix]);

  if (prefix === null || commands.length === 0) return null;

  const filtered = prefix
    ? commands.filter(c => c.name.startsWith(prefix.toLowerCase()))
    : commands;

  if (filtered.length === 0) return null;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex].name);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  };

  return (
    <AutocompleteKeyHandler onKeyDown={handleKeyDown}>
      <div
        ref={listRef}
        className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50"
        style={{ maxHeight: `${MAX_VISIBLE * 44}px` }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: `${MAX_VISIBLE * 44}px` }}>
          {filtered.slice(0, 20).map((cmd, i) => (
            <button
              key={cmd.name}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                i === selectedIndex
                  ? 'bg-[var(--color-primary)]/15 text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-primary)]/5'
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(cmd.name)}
            >
              <span className="font-mono text-[var(--color-primary)] shrink-0">/{cmd.name}</span>
              <span className="truncate opacity-70">{cmd.description}</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] shrink-0">
                {CATEGORY_BADGES[cmd.category] || cmd.category}
              </span>
            </button>
          ))}
        </div>
      </div>
    </AutocompleteKeyHandler>
  );
}

/** Invisible wrapper that captures keyboard events for the autocomplete. */
function AutocompleteKeyHandler({ onKeyDown, children }: { onKeyDown: (e: KeyboardEvent) => void; children: React.ReactNode }) {
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onKeyDown]);
  return <>{children}</>;
}
