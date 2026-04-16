/** Phase 8.6: Branch navigator panel.
 *
 * Collapsible panel (same pattern as SummaryPanel) listing all saved
 * checkpoints for the current chat. Branches can be loaded, renamed, or
 * deleted. An active-branch indicator shows when a snapshot is loaded.
 */
import { useState, useCallback } from 'react';
import { GitFork, ChevronDown, ChevronUp, Trash2, Check, X, Pencil } from 'lucide-react';
import { useBranchStore } from '../../stores/branchStore';
import { useChatStore } from '../../stores/chatStore';

interface BranchPanelProps {
  chatFile: string;
  /** Controlled open state. When provided, removes the persistent header row. */
  isOpen?: boolean;
  onToggle?: () => void;
}

export function BranchPanel({ chatFile, isOpen, onToggle }: BranchPanelProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = isOpen !== undefined;
  const isExpanded = isControlled ? isOpen : internalExpanded;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const branches = useBranchStore((s) => s.branches);
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const deleteBranch = useBranchStore((s) => s.deleteBranch);
  const renameBranch = useBranchStore((s) => s.renameBranch);
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch);
  const loadBranchMessages = useChatStore((s) => s.loadBranchMessages);

  const handleLoad = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) return;
      loadBranchMessages(branch.messages);
      setActiveBranch(branchId);
      if (!isControlled) setInternalExpanded(false);
      else onToggle?.();
    },
    [branches, loadBranchMessages, setActiveBranch, isControlled, onToggle]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteBranch(id, chatFile);
    },
    [chatFile, deleteBranch]
  );

  const commitRename = useCallback(
    (id: string) => {
      const branch = branches.find((b) => b.id === id);
      if (!branch) return;
      renameBranch(id, chatFile, renameValue.trim() || branch.name);
      setRenamingId(null);
    },
    [branches, chatFile, renameBranch, renameValue]
  );

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const hasBranches = branches.length > 0;

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
          aria-label="Toggle branch panel"
        >
          <GitFork
            size={14}
            className={hasBranches ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}
          />
          <span className={`font-medium ${hasBranches ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Branches
          </span>
          {activeBranch && (
            <span className="text-xs text-[var(--color-text-secondary)] truncate max-w-[120px]">
              · {activeBranch.name}
            </span>
          )}
          {hasBranches && (
            <span className="text-xs text-[var(--color-text-secondary)]">
              ({branches.length})
            </span>
          )}
          <span className="ml-auto text-[var(--color-text-secondary)]">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
      )}

      {/* Controlled mode: always open, show inline header with close button */}
      {isControlled && (
        <div className="flex items-center gap-2 px-4 py-2">
          <GitFork size={14} className={hasBranches ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'} />
          <span className={`text-sm font-medium flex-1 ${hasBranches ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
            Branches
            {hasBranches && <span className="text-xs font-normal ml-1">({branches.length})</span>}
            {activeBranch && <span className="text-xs font-normal ml-1 text-[var(--color-text-secondary)]">· {activeBranch.name}</span>}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close branch panel"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-3 bg-[var(--color-bg-secondary)]">
          {!hasBranches ? (
            <p className="text-xs text-[var(--color-text-secondary)] italic py-2">
              No checkpoints yet. Open the … menu on any message to create one.
            </p>
          ) : (
            <div className="space-y-1 mt-1">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranchId;
                const isRenaming = renamingId === branch.id;
                const date = new Date(branch.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={branch.id}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                      isActive
                        ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
                        : 'hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  >
                    <GitFork
                      size={12}
                      className={
                        isActive
                          ? 'text-[var(--color-primary)] flex-shrink-0'
                          : 'text-[var(--color-text-secondary)] flex-shrink-0'
                      }
                    />

                    {isRenaming ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(branch.id);
                          else if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="flex-1 min-w-0 text-xs bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => handleLoad(branch.id)}
                        className="flex-1 min-w-0 text-left"
                        title="Load this checkpoint"
                      >
                        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                          {branch.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {branch.messageCount} msgs · {date}
                        </p>
                      </button>
                    )}

                    {isRenaming ? (
                      <>
                        <button
                          onClick={() => commitRename(branch.id)}
                          className="p-1 text-green-400 hover:text-green-300 transition-colors"
                          title="Confirm rename"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setRenamingId(branch.id);
                            setRenameValue(branch.name);
                          }}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(branch.id)}
                          className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
                          title="Delete checkpoint"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
