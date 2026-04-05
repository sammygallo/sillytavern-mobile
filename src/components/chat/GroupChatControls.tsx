import { useMemo } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { CharacterInfo } from '../../api/client';
import {
  useChatStore,
  getTalkativeness,
  type GroupActivationStrategy,
} from '../../stores/chatStore';

interface GroupChatControlsProps {
  fileName: string;
  characters: CharacterInfo[];
}

const STRATEGY_OPTIONS: Array<{
  value: GroupActivationStrategy;
  label: string;
  hint: string;
}> = [
  {
    value: 'list',
    label: 'List',
    hint: 'Every member replies in order (default).',
  },
  {
    value: 'natural',
    label: 'Natural',
    hint: 'Pick who was mentioned, else weighted by talkativeness.',
  },
  {
    value: 'pooled',
    label: 'Pooled',
    hint: 'Weighted random, skipping the most recent speaker(s).',
  },
];

/**
 * Collapsible controls for the active group chat: activation strategy,
 * pooled exclusion window, and per-member mute toggles. All changes are
 * written straight to the persisted group chat record.
 */
export function GroupChatControls({ fileName, characters }: GroupChatControlsProps) {
  const groupChat = useChatStore((s) =>
    s.groupChats.find((g) => g.fileName === fileName) || null
  );
  const setGroupActivationStrategy = useChatStore((s) => s.setGroupActivationStrategy);
  const toggleGroupMute = useChatStore((s) => s.toggleGroupMute);
  const setGroupPooledExcludeRecent = useChatStore((s) => s.setGroupPooledExcludeRecent);

  const mutedSet = useMemo(
    () => new Set(groupChat?.mutedAvatars ?? []),
    [groupChat?.mutedAvatars]
  );

  if (!groupChat) return null;

  const strategy = groupChat.activationStrategy;
  const excludeRecent = groupChat.pooledExcludeRecent;
  // Pooled N must stay below the pool size so we always have a valid fallback.
  const maxExclude = Math.max(0, characters.length - 1);
  const activeHint =
    STRATEGY_OPTIONS.find((o) => o.value === strategy)?.hint ?? '';

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Activation strategy
          </label>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--color-bg-tertiary)] p-1">
          {STRATEGY_OPTIONS.map((opt) => {
            const active = opt.value === strategy;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupActivationStrategy(fileName, opt.value)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
          {activeHint}
        </p>
      </div>

      {strategy === 'pooled' && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1.5">
            Skip last {excludeRecent} speaker{excludeRecent === 1 ? '' : 's'}
          </label>
          <input
            type="range"
            min={0}
            max={maxExclude}
            step={1}
            value={Math.min(excludeRecent, maxExclude)}
            onChange={(e) =>
              setGroupPooledExcludeRecent(fileName, Number(e.target.value))
            }
            className="w-full"
            aria-label="Pooled exclude-recent count"
          />
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Members who spoke in the last {excludeRecent} turn
            {excludeRecent === 1 ? '' : 's'} are skipped by the pooled roll.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1.5">
          Members ({characters.length - mutedSet.size}/{characters.length} active)
        </label>
        <ul className="space-y-1">
          {characters.map((c) => {
            const muted = mutedSet.has(c.avatar);
            const talk = getTalkativeness(c);
            return (
              <li key={c.avatar}>
                <button
                  type="button"
                  onClick={() => toggleGroupMute(fileName, c.avatar)}
                  className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    muted
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] opacity-70'
                      : 'bg-[var(--color-bg-tertiary)]/50 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                  aria-pressed={muted}
                  title={muted ? `Unmute ${c.name}` : `Mute ${c.name}`}
                >
                  {muted ? (
                    <VolumeX size={16} className="text-red-400 flex-shrink-0" />
                  ) : (
                    <Volume2
                      size={16}
                      className="text-[var(--color-primary)] flex-shrink-0"
                    />
                  )}
                  <span
                    className={`flex-1 text-left truncate ${
                      muted ? 'line-through' : ''
                    }`}
                  >
                    {c.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)] tabular-nums flex-shrink-0">
                    t={talk.toFixed(2)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
