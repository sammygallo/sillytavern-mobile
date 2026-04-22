import { BookOpen } from 'lucide-react';
import { useWorldInfoStore } from '../../stores/worldInfoStore';
import { Modal } from '../ui';

interface ChatLorebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chat file name — same key persona locks use. */
  chatFile: string;
}

// Stable fallback so the zustand selector never returns a fresh array reference.
// Fresh `[]` per call destabilizes useSyncExternalStore and trips React #185.
const EMPTY_IDS: string[] = [];

/**
 * Per-chat lorebook picker. Picked books are auto-activated whenever this
 * chat is open, stacked on top of the globally-active list, the character's
 * embedded/linked books, and the active persona's linked books.
 *
 * This is the "chat memories" bucket — dedicate one or more lorebooks to a
 * chat for running notes, plot state, etc.
 */
export function ChatLorebookModal({ isOpen, onClose, chatFile }: ChatLorebookModalProps) {
  const books = useWorldInfoStore((s) => s.books);
  const linkedBookIds = useWorldInfoStore((s) =>
    s.chatLinkedBookIds[chatFile] ?? EMPTY_IDS
  );
  const setChatLinkedBookIds = useWorldInfoStore((s) => s.setChatLinkedBookIds);

  // Only non-character-owned books are eligible.
  const candidateBooks = books.filter((b) => b.ownerCharacterAvatar == null);

  const toggle = (bookId: string) => {
    if (linkedBookIds.includes(bookId)) {
      setChatLinkedBookIds(
        chatFile,
        linkedBookIds.filter((id) => id !== bookId)
      );
    } else {
      setChatLinkedBookIds(chatFile, [...linkedBookIds, bookId]);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chat Lorebooks" size="md">
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
          <BookOpen size={14} className="shrink-0 mt-0.5" />
          <p>
            Books linked here are auto-activated for this chat only — useful
            for chat-specific notes, running plot state, or memories.
          </p>
        </div>

        {candidateBooks.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)] py-4 text-center">
            No global lorebooks exist yet. Create some in Settings → World Info.
          </p>
        ) : (
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {candidateBooks.map((book) => {
              const checked = linkedBookIds.includes(book.id);
              return (
                <li key={book.id}>
                  <label className="flex items-center gap-2.5 cursor-pointer rounded-md px-2 py-1.5 hover:bg-[var(--color-bg-tertiary)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(book.id)}
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
      </div>
    </Modal>
  );
}
