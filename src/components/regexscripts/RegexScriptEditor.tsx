import { useState, useMemo } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { RegexScript, RegexScope } from '../../stores/regexScriptStore';
import { useCharacterStore } from '../../stores/characterStore';

interface RegexScriptEditorProps {
  script: RegexScript | null;
  onSave: (data: Partial<RegexScript>) => void;
  onCancel: () => void;
}

const SCOPE_OPTIONS: Array<{ value: RegexScope; label: string }> = [
  { value: 'ai_output', label: 'AI Output' },
  { value: 'user_input', label: 'User Input' },
  { value: 'both', label: 'Both' },
];

export function RegexScriptEditor({ script, onSave, onCancel }: RegexScriptEditorProps) {
  const [name, setName] = useState(script?.name || '');
  const [pattern, setPattern] = useState(script?.pattern || '');
  const [replacement, setReplacement] = useState(script?.replacement ?? '');
  const [flags, setFlags] = useState(script?.flags || 'g');
  const [scope, setScope] = useState<RegexScope>(script?.scope || 'ai_output');
  const [displayOnly, setDisplayOnly] = useState(script?.displayOnly ?? false);
  const [characterScope, setCharacterScope] = useState<string[]>(script?.characterScope || []);
  const [order, setOrder] = useState(script?.order ?? 0);

  const characters = useCharacterStore((s) => s.characters);

  const patternValid = useMemo(() => {
    if (!pattern.trim()) return null; // empty = neutral
    try {
      new RegExp(pattern, flags);
      return true;
    } catch {
      return false;
    }
  }, [pattern, flags]);

  const toggleFlag = (flag: string) => {
    setFlags((f) => f.includes(flag) ? f.replace(flag, '') : f + flag);
  };

  const toggleCharacter = (avatar: string) => {
    setCharacterScope((prev) =>
      prev.includes(avatar) ? prev.filter((a) => a !== avatar) : [...prev, avatar]
    );
  };

  const handleSave = () => {
    if (!pattern.trim() || patternValid === false) return;
    onSave({
      name: name.trim() || 'Untitled Script',
      pattern,
      replacement,
      flags,
      scope,
      displayOnly,
      characterScope,
      order,
    });
  };

  return (
    <Modal isOpen onClose={onCancel} title={script ? 'Edit Script' : 'New Script'} size="lg">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Script"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>

        {/* Pattern */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Pattern (regex)
            {patternValid === true && <Check size={12} className="inline ml-1 text-green-400" />}
            {patternValid === false && <AlertCircle size={12} className="inline ml-1 text-red-400" />}
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="\\*([^*]+)\\*"
            className={`w-full px-3 py-2 text-sm font-mono rounded-lg border bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 ${
              patternValid === false
                ? 'border-red-500 focus:ring-red-500'
                : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
            }`}
          />
          {patternValid === false && (
            <p className="text-xs text-red-400 mt-1">Invalid regex pattern</p>
          )}
        </div>

        {/* Replacement */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Replacement
          </label>
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="$1 (use $1, $2 for capture groups)"
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>

        {/* Flags */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Flags</label>
          <div className="flex gap-2">
            {[
              { flag: 'g', label: 'Global', hint: 'Replace all matches' },
              { flag: 'i', label: 'Case-insensitive', hint: 'Ignore case' },
              { flag: 'm', label: 'Multiline', hint: '^ and $ match line boundaries' },
              { flag: 's', label: 'Dotall', hint: '. matches newlines' },
            ].map(({ flag, label }) => (
              <button
                key={flag}
                type="button"
                onClick={() => toggleFlag(flag)}
                className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                  flags.includes(flag)
                    ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                {flag}
                <span className="ml-1 font-sans">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scope + Display Only */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as RegexScope)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Order</label>
            <input
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={displayOnly}
            onChange={(e) => setDisplayOnly(e.target.checked)}
            className="rounded border-[var(--color-border)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">Display only</span>
          <span className="text-xs text-[var(--color-text-secondary)]">(visual transform, original text preserved)</span>
        </label>

        {/* Character Scope */}
        {characters.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Character Scope
              <span className="ml-1 font-normal">(none selected = applies to all)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {characters.map((c) => (
                <button
                  key={c.avatar}
                  type="button"
                  onClick={() => toggleCharacter(c.avatar)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    characterScope.includes(c.avatar)
                      ? 'bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!pattern.trim() || patternValid === false}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
