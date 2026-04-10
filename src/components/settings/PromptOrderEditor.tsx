import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  useGenerationStore,
  PROMPT_SECTION_LABELS,
  PROMPT_SECTION_DESCRIPTIONS,
  POST_HISTORY_SECTIONS,
} from '../../stores/generationStore';
import { Button } from '../ui';

/**
 * Phase 9.1 — Prompt Order Editor.
 *
 * Renders the user's prompt-section order as a reorderable list. Each row
 * shows the section label + description, an enable checkbox, and up/down
 * arrow buttons. Follows the QuickReplyPage arrow-button reorder pattern to
 * avoid pulling in a DnD library.
 */
export function PromptOrderEditor() {
  const { promptOrder, movePromptSection, togglePromptSection, resetPromptOrder } =
    useGenerationStore();

  return (
    <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Prompt Order
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetPromptOrder}
          className="text-xs"
          aria-label="Reset to defaults"
        >
          <RotateCcw size={14} className="mr-1" />
          Reset
        </Button>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] mb-4 leading-relaxed">
        Reorder or disable prompt sections. Sections marked <em>post-history</em>{' '}
        are placed after the chat history. At-depth injections (author's note,
        depth prompts) are not reorderable here — they're controlled by their
        own depth settings.
      </p>

      <ul className="space-y-2">
        {promptOrder.map((entry, idx) => {
          const label = PROMPT_SECTION_LABELS[entry.id];
          const description = PROMPT_SECTION_DESCRIPTIONS[entry.id];
          const isPostHistory = POST_HISTORY_SECTIONS.has(entry.id);
          const atTop = idx === 0;
          const atBottom = idx === promptOrder.length - 1;
          return (
            <li
              key={entry.id}
              className={`
                bg-[var(--color-bg-tertiary)] rounded-lg border border-[var(--color-border)]
                ${entry.enabled ? '' : 'opacity-50'}
              `}
            >
              <div className="flex items-start gap-2 p-3">
                {/* Order + enable controls */}
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => movePromptSection(entry.id, 'up')}
                    disabled={atTop}
                    className="p-1 rounded hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-primary)]"
                    aria-label={`Move ${label} up`}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => movePromptSection(entry.id, 'down')}
                    disabled={atBottom}
                    className="p-1 rounded hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--color-text-primary)]"
                    aria-label={`Move ${label} down`}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>

                {/* Label + description */}
                <label className="flex-1 min-w-0 cursor-pointer flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => togglePromptSection(entry.id)}
                    className="mt-1 accent-[var(--color-primary)]"
                    aria-label={`Enable ${label}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {label}
                      </span>
                      {isPostHistory && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                          post-history
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                      {description}
                    </p>
                  </div>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
