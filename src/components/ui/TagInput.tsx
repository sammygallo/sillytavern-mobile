import { useState, useRef, useCallback, useId } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  label?: string;
  placeholder?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  label,
  placeholder = 'Add tag...',
}: TagInputProps) {
  const [inputText, setInputText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed || value.includes(trimmed)) return;
      onChange([...value, trimmed]);
      setInputText('');
    },
    [value, onChange]
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange]
  );

  const filteredSuggestions =
    inputText.trim()
      ? suggestions.filter(
          (s) => s.toLowerCase().includes(inputText.toLowerCase()) && !value.includes(s)
        )
      : [];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputText.trim()) {
        addTag(inputText);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Backspace' && !inputText && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <div
          className="min-h-[42px] px-2 py-1.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg flex flex-wrap gap-1.5 items-center cursor-text focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:border-transparent"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs rounded-full select-none"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--color-text-primary)] placeholder-zinc-500"
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden">
            {filteredSuggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(suggestion);
                  setShowSuggestions(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        Press Enter or comma to add · Backspace to remove last
      </p>
    </div>
  );
}
