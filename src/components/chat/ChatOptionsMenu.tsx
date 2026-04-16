/**
 * ChatOptionsMenu — bottom sheet for chat-level actions.
 *
 * Extensions (Author's Note, Summary, Branches) are shown as a compact icon
 * strip rather than individual rows, saving screen real estate.
 */
import { BookOpen, FileText, GitFork, MessageSquare, FolderOpen, Trash2, RefreshCw, ArrowRight, User, Flag, Users } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatPanelState {
  isOpen: boolean;
  hasContent: boolean;
  onToggle: () => void;
}

interface ChatOptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;

  // -- Extension panels (shown as icon strip) --
  authorNote: ChatPanelState;
  summary: ChatPanelState & { enabled: boolean };
  branches: ChatPanelState & { count: number };

  // -- Chat management --
  onStartNewChat: () => void;
  onManageChatFiles: () => void;
  /** Only provided when a chat file is loaded. */
  onSaveCheckpoint?: () => void;
  onDeleteMessages: () => void;

  // -- AI actions (undefined = not currently available) --
  onRegenerate?: () => void;
  onContinue?: () => void;
  onImpersonate?: () => void;

  // -- Context --
  isGroupChat: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed
        ${danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
        }`}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-[var(--color-border)]" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChatOptionsMenu({
  isOpen,
  onClose,
  authorNote,
  summary,
  branches,
  onStartNewChat,
  onManageChatFiles,
  onSaveCheckpoint,
  onDeleteMessages,
  onRegenerate,
  onContinue,
  onImpersonate,
  isGroupChat,
}: ChatOptionsMenuProps) {
  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  const extensionPanels = [
    {
      id: 'authorNote',
      icon: BookOpen,
      label: "Author's Note",
      isOpen: authorNote.isOpen,
      hasContent: authorNote.hasContent,
      onToggle: wrap(authorNote.onToggle),
    },
    ...(summary.enabled
      ? [{
          id: 'summary',
          icon: FileText,
          label: 'Summary',
          isOpen: summary.isOpen,
          hasContent: summary.hasContent,
          onToggle: wrap(summary.onToggle),
        }]
      : []),
    {
      id: 'branches',
      icon: GitFork,
      label: `Branches${branches.count > 0 ? ` (${branches.count})` : ''}`,
      isOpen: branches.isOpen,
      hasContent: branches.count > 0,
      onToggle: wrap(branches.onToggle),
    },
  ];

  const hasAiActions = !!(onRegenerate || onContinue || onImpersonate);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Chat Options">
      {/* Extension panels — compact icon strip */}
      <div className="mb-4">
        <p className="text-xs text-[var(--color-text-secondary)] mb-2">Panels</p>
        <div className="flex gap-2 flex-wrap">
          {extensionPanels.map((panel) => {
            const Icon = panel.icon;
            const active = panel.isOpen || panel.hasContent;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={panel.onToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                  ${active
                    ? 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/40 text-[var(--color-primary)]'
                    : 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-secondary)]/40'
                  }`}
              >
                <Icon size={12} />
                <span>{panel.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Divider />

      {/* Chat management */}
      <div className="py-1">
        <ActionRow icon={MessageSquare} label="Start new chat" onClick={wrap(onStartNewChat)} />
        <ActionRow icon={FolderOpen} label="Manage chat files" onClick={wrap(onManageChatFiles)} />
        {onSaveCheckpoint && (
          <ActionRow icon={Flag} label="Save checkpoint" onClick={wrap(onSaveCheckpoint)} />
        )}
        {!isGroupChat && (
          <ActionRow icon={Users} label="Convert to group" onClick={wrap(() => { /* future */ })} disabled />
        )}
      </div>

      {hasAiActions && (
        <>
          <Divider />
          <div className="py-1">
            {onRegenerate && (
              <ActionRow icon={RefreshCw} label="Regenerate" onClick={wrap(onRegenerate)} />
            )}
            {onContinue && (
              <ActionRow icon={ArrowRight} label="Continue" onClick={wrap(onContinue)} />
            )}
            {onImpersonate && (
              <ActionRow icon={User} label="Impersonate" onClick={wrap(onImpersonate)} />
            )}
          </div>
        </>
      )}

      <Divider />

      <div className="py-1">
        <ActionRow icon={Trash2} label="Delete messages" onClick={wrap(onDeleteMessages)} danger />
      </div>
    </BottomSheet>
  );
}
