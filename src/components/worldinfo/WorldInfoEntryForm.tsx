import { useEffect, useState } from 'react';
import {
  useWorldInfoStore,
  type WorldInfoEntry,
  type WorldInfoPosition,
} from '../../stores/worldInfoStore';
import { Button, Input, TextArea } from '../ui';

interface WorldInfoEntryFormProps {
  bookId: string;
  entry: WorldInfoEntry | null; // null = creating new
  onClose: () => void;
}

const POSITION_OPTIONS: { value: WorldInfoPosition; label: string; hint: string }[] = [
  { value: 'before_char', label: 'Before Character', hint: 'Injected before character description' },
  { value: 'after_char', label: 'After Character', hint: "Injected after character description" },
  { value: 'before_an', label: "Before Author's Note", hint: 'Injected before auxiliary prompt' },
  { value: 'after_an', label: "After Author's Note", hint: 'Injected after post-history instructions' },
  { value: 'at_depth', label: '@ Depth', hint: 'Injected at a specific depth in the chat' },
];

export function WorldInfoEntryForm({ bookId, entry, onClose }: WorldInfoEntryFormProps) {
  const { createEntry, updateEntry } = useWorldInfoStore();

  const [keys, setKeys] = useState('');
  const [content, setContent] = useState('');
  const [comment, setComment] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [constant, setConstant] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [position, setPosition] = useState<WorldInfoPosition>('before_char');
  const [depth, setDepth] = useState(4);
  const [order, setOrder] = useState(100);

  useEffect(() => {
    if (entry) {
      setKeys(entry.keys.join(', '));
      setContent(entry.content);
      setComment(entry.comment);
      setEnabled(entry.enabled);
      setConstant(entry.constant);
      setCaseSensitive(entry.caseSensitive);
      setPosition(entry.position);
      setDepth(entry.depth);
      setOrder(entry.order);
    } else {
      setKeys('');
      setContent('');
      setComment('');
      setEnabled(true);
      setConstant(false);
      setCaseSensitive(false);
      setPosition('before_char');
      setDepth(4);
      setOrder(100);
    }
  }, [entry]);

  const parsedKeys = keys
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (!constant && parsedKeys.length === 0) return;

    const data = {
      keys: parsedKeys,
      content: content.trim(),
      comment: comment.trim(),
      enabled,
      constant,
      caseSensitive,
      position,
      depth,
      order,
    };

    if (entry) {
      updateEntry(bookId, entry.id, data);
    } else {
      createEntry(bookId, data);
    }
    onClose();
  };

  const canSubmit = content.trim().length > 0 && (constant || parsedKeys.length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Keywords (comma-separated)"
        placeholder="e.g. dragon, wyrm, drake"
        value={keys}
        onChange={(e) => setKeys(e.target.value)}
        disabled={constant}
        autoFocus={!entry}
      />
      <p className="-mt-3 text-xs text-[var(--color-text-secondary)]">
        {constant
          ? 'Constant entries activate on every generation; keywords are ignored.'
          : 'Entry activates when ANY keyword appears in scanned chat history.'}
      </p>

      <TextArea
        label="Content *"
        placeholder="Lore content to inject into the prompt when triggered. Supports {{char}}, {{user}}, etc."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        required
      />

      <Input
        label="Comment (optional)"
        placeholder="Displayed in the UI only"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
          Position
        </label>
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as WorldInfoPosition)}
          className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          {POSITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          {POSITION_OPTIONS.find((o) => o.value === position)?.hint}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {position === 'at_depth' && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Depth
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        )}
        <div className={position === 'at_depth' ? '' : 'col-span-2'}>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Order
          </label>
          <input
            type="number"
            min={0}
            max={10000}
            value={order}
            onChange={(e) => setOrder(Number(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Lower order is injected first.
          </p>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
          <input
            type="checkbox"
            checked={constant}
            onChange={(e) => setConstant(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          Constant (always inject, ignore keywords)
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            disabled={constant}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          Case-sensitive matching
        </label>
      </div>

      <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="flex-1"
        >
          {entry ? 'Save Changes' : 'Create Entry'}
        </Button>
      </div>
    </form>
  );
}
