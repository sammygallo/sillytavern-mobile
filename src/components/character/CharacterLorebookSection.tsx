import { useState } from 'react';
import { BookOpen, Edit2, Plus, Trash2 } from 'lucide-react';
import { useWorldInfoStore } from '../../stores/worldInfoStore';
import { WorldInfoBookEditor } from '../worldinfo/WorldInfoBookEditor';

interface CharacterLorebookSectionProps {
  /** The character's avatar filename (unique id). */
  avatar: string;
  /** Human-readable character name, used when creating a new embedded book. */
  characterName?: string;
  /** Currently-linked extra book ids (staged). */
  linkedBookIds: string[];
  /** Called with the new full list whenever the user toggles a checkbox. */
  onLinkedBookIdsChange: (ids: string[]) => void;
}

/**
 * CharacterEdit sub-section that surfaces the character's embedded
 * lorebook (if any) and lets the user attach extra non-owner global
 * lorebooks to auto-activate whenever the character is selected.
 */
export function CharacterLorebookSection({
  avatar,
  characterName,
  linkedBookIds,
  onLinkedBookIdsChange,
}: CharacterLorebookSectionProps) {
  const books = useWorldInfoStore((s) => s.books);
  const createCharacterBook = useWorldInfoStore((s) => s.createCharacterBook);
  const deleteCharacterBook = useWorldInfoStore((s) => s.deleteCharacterBook);
  const [editingEmbedded, setEditingEmbedded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const embeddedBook = books.find((b) => b.ownerCharacterAvatar === avatar);
  // Only non-character-owned books are eligible to be linked as extras
  // (picking another character's embedded book would be surprising).
  const candidateBooks = books.filter((b) => b.ownerCharacterAvatar == null);

  const toggleLink = (bookId: string) => {
    if (linkedBookIds.includes(bookId)) {
      onLinkedBookIdsChange(linkedBookIds.filter((id) => id !== bookId));
    } else {
      onLinkedBookIdsChange([...linkedBookIds, bookId]);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen size={16} className="text-[var(--color-text-secondary)]" />
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Lorebooks
        </h3>
      </div>

      {/* Embedded book */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
        <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Embedded Lorebook
        </p>
        {embeddedBook ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {embeddedBook.name}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {embeddedBook.entries.length} entr
                {embeddedBook.entries.length === 1 ? 'y' : 'ies'} · auto-active
                for this character
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingEmbedded(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border)]"
              aria-label="Edit embedded lorebook"
            >
              <Edit2 size={13} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-[var(--color-border)]"
              aria-label="Remove embedded lorebook"
            >
              <Trash2 size={13} />
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm text-[var(--color-text-secondary)]">
              No embedded lorebook yet.
            </p>
            <button
              type="button"
              onClick={() => {
                const fallback = characterName
                  ? `${characterName}'s Lorebook`
                  : 'Character Lorebook';
                createCharacterBook(avatar, fallback);
                setEditingEmbedded(true);
              }}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border)]"
              aria-label="Add embedded lorebook"
            >
              <Plus size={13} />
              Add Lorebook
            </button>
          </div>
        )}
        {confirmRemove && embeddedBook && (
          <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-[var(--color-text-primary)]">
            <p>Remove the embedded lorebook and all its entries? This cannot be undone.</p>
            <div className="mt-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCharacterBook(avatar);
                  setConfirmRemove(false);
                }}
                className="px-2 py-1 rounded bg-red-500/80 text-white hover:bg-red-500"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Linked books */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
        <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Additional Lorebooks
        </p>
        {candidateBooks.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No global lorebooks exist yet. Create some in Settings → World
            Info.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {candidateBooks.map((book) => {
              const checked = linkedBookIds.includes(book.id);
              return (
                <li key={book.id}>
                  <label className="flex items-center gap-2.5 cursor-pointer rounded-md px-1.5 py-1 hover:bg-[var(--color-bg-secondary)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLink(book.id)}
                      className="w-4 h-4 accent-[var(--color-primary)]"
                    />
                    <span className="flex-1 min-w-0 text-sm text-[var(--color-text-primary)] truncate">
                      {book.name}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {book.entries.length}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Linked books are auto-activated (in addition to globally-active
          books) whenever this character is the scan target.
        </p>
      </div>

      {embeddedBook && editingEmbedded && (
        <WorldInfoBookEditor
          isOpen={editingEmbedded}
          onClose={() => setEditingEmbedded(false)}
          book={embeddedBook}
        />
      )}
    </section>
  );
}
