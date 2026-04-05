import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Copy,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useWorldInfoStore,
  type WorldInfoBook,
} from '../../stores/worldInfoStore';
import { Button, Input, ConfirmDialog } from '../ui';
import { WorldInfoBookEditor } from './WorldInfoBookEditor';

export function WorldInfoPage() {
  const navigate = useNavigate();
  const {
    books,
    activeBookIds,
    scanDepth,
    maxRecursionSteps,
    tokenBudget,
    error,
    createBook,
    renameBook,
    deleteBook,
    duplicateBook,
    toggleBookActive,
    setScanDepth,
    setMaxRecursionSteps,
    setTokenBudget,
    exportBookJson,
    importBookJson,
    clearError,
  } = useWorldInfoStore();

  const [newBookName, setNewBookName] = useState('');
  const [editingBook, setEditingBook] = useState<WorldInfoBook | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<WorldInfoBook | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCreate = () => {
    const trimmed = newBookName.trim();
    if (!trimmed) return;
    createBook(trimmed);
    setNewBookName('');
  };

  const handleStartRename = (book: WorldInfoBook) => {
    setRenamingId(book.id);
    setRenameValue(book.name);
  };

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      renameBook(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleExport = (book: WorldInfoBook) => {
    const json = exportBookJson(book.id);
    if (!json) return;
    const safeName = book.name.replace(/[^a-z0-9_\-\s]/gi, '_').trim() || 'lorebook';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset
    try {
      const text = await file.text();
      const nameFromFile = file.name.replace(/\.json$/i, '');
      const imported = importBookJson(text, nameFromFile);
      if (imported) {
        setImportNotice(
          `Imported "${imported.name}" with ${imported.entries.length} entr${imported.entries.length === 1 ? 'y' : 'ies'}`
        );
        setTimeout(() => setImportNotice(null), 4000);
      }
    } catch (err) {
      console.error('[WI] Import failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="p-2"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex-1">
          World Info
        </h1>
        <span className="text-xs px-2 py-1 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
          {activeBookIds.length} active
        </span>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-300"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {importNotice && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-400">{importNotice}</p>
          </div>
        )}

        {/* Global settings */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Scan Settings
          </h2>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">
                Scan Depth
              </label>
              <input
                type="number"
                value={scanDepth}
                min={1}
                max={50}
                onChange={(e) => setScanDepth(Number(e.target.value) || 4)}
                className="w-20 px-2 py-1 text-sm text-right bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={scanDepth}
              onChange={(e) => setScanDepth(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Number of recent messages scanned for keyword matches.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">
                Max Recursion Steps
              </label>
              <input
                type="number"
                value={maxRecursionSteps}
                min={0}
                max={10}
                onChange={(e) =>
                  setMaxRecursionSteps(Number(e.target.value) || 0)
                }
                className="w-20 px-2 py-1 text-sm text-right bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={maxRecursionSteps}
              onChange={(e) => setMaxRecursionSteps(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              How many times to rescan using matched entries' content as the
              haystack. 0 disables recursion.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-[var(--color-text-secondary)]">
                Token Budget
              </label>
              <input
                type="number"
                value={tokenBudget}
                min={0}
                max={32768}
                step={64}
                onChange={(e) => setTokenBudget(Number(e.target.value) || 0)}
                className="w-24 px-2 py-1 text-sm text-right bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Max total tokens of injected entries. Entries with higher{' '}
              <code>order</code> are dropped first when over budget. 0 =
              unlimited.
            </p>
          </div>
        </section>

        {/* Lorebooks */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Lorebooks
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelected}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleImportClick}
              className="text-xs"
            >
              <Upload size={14} className="mr-1" />
              Import
            </Button>
          </div>

          <div className="flex gap-2 mb-3">
            <Input
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder="New lorebook name..."
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="flex-1"
            />
            <Button
              onClick={handleCreate}
              disabled={!newBookName.trim()}
              className="shrink-0"
              size="sm"
            >
              <Plus size={14} className="mr-1" />
              Create
            </Button>
          </div>

          {books.length === 0 ? (
            <div className="text-center py-10">
              <BookOpen
                size={48}
                className="mx-auto text-[var(--color-text-secondary)] mb-3"
              />
              <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                No lorebooks yet
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Create one above, or import an existing World Info JSON.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {books.map((book) => {
                const isActive = activeBookIds.includes(book.id);
                const isRenaming = renamingId === book.id;
                return (
                  <li
                    key={book.id}
                    className={`
                      p-3 rounded-lg border transition-colors
                      ${
                        isActive
                          ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]'
                          : 'bg-[var(--color-bg-tertiary)] border-[var(--color-border)]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <label className="flex items-center cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => toggleBookActive(book.id)}
                          className="w-4 h-4 accent-[var(--color-primary)]"
                          aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${book.name}`}
                        />
                      </label>
                      {isRenaming ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={handleFinishRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            if (e.key === 'Escape') {
                              setRenamingId(null);
                              setRenameValue('');
                            }
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        />
                      ) : (
                        <button
                          onClick={() => setEditingBook(book)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {book.name}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {book.entries.length} entr
                            {book.entries.length === 1 ? 'y' : 'ies'}
                            {isActive ? ' · active' : ''}
                          </p>
                        </button>
                      )}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => handleStartRename(book)}
                          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
                          title="Rename"
                          aria-label="Rename lorebook"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => duplicateBook(book.id)}
                          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
                          title="Duplicate"
                          aria-label="Duplicate lorebook"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => handleExport(book)}
                          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]"
                          title="Export JSON"
                          aria-label="Export lorebook"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(book)}
                          className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-red-500/10"
                          title="Delete"
                          aria-label="Delete lorebook"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="text-center py-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Lorebooks are stored locally. Active books are scanned against recent
            messages; matching entries are injected at their configured position.
          </p>
        </section>
      </div>

      {editingBook && (
        <WorldInfoBookEditor
          isOpen={!!editingBook}
          onClose={() => setEditingBook(null)}
          book={books.find((b) => b.id === editingBook.id) || editingBook}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            deleteBook(confirmDelete.id);
            setConfirmDelete(null);
          }}
          title="Delete Lorebook"
          message={`Delete "${confirmDelete.name}" and all its entries? This cannot be undone.`}
          confirmLabel="Delete"
          danger
        />
      )}
    </div>
  );
}
