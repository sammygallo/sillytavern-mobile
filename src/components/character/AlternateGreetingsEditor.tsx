import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button, TextArea } from '../ui';

interface AlternateGreetingsEditorProps {
  greetings: string[];
  onChange: (greetings: string[]) => void;
}

export function AlternateGreetingsEditor({ greetings, onChange }: AlternateGreetingsEditorProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleAdd = () => {
    const next = [...greetings, ''];
    onChange(next);
    setActiveIndex(next.length - 1);
  };

  const handleRemove = (index: number) => {
    const next = greetings.filter((_, i) => i !== index);
    onChange(next);
    setActiveIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
  };

  const handleEdit = (index: number, value: string) => {
    const next = greetings.map((g, i) => (i === index ? value : g));
    onChange(next);
  };

  const count = greetings.length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Alternate Greetings {count > 0 && `(${count})`}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="py-1 px-2 text-xs"
          onClick={handleAdd}
        >
          <Plus size={14} className="mr-1" />
          Add
        </Button>
      </div>

      {count === 0 ? (
        <p className="text-xs text-[var(--color-text-secondary)] italic px-3 py-2 bg-[var(--color-bg-tertiary)] rounded-lg">
          No alternate greetings yet. Users can swipe to pick a different opening message.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="py-1 px-2"
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={activeIndex === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-xs text-[var(--color-text-secondary)]">
              Greeting {activeIndex + 1} of {count}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="py-1 px-2"
              onClick={() => setActiveIndex((i) => Math.min(count - 1, i + 1))}
              disabled={activeIndex >= count - 1}
            >
              <ChevronRight size={14} />
            </Button>
          </div>

          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TextArea
                placeholder={`Alternate greeting ${activeIndex + 1}...`}
                value={greetings[activeIndex] || ''}
                onChange={(e) => handleEdit(activeIndex, e.target.value)}
                rows={3}
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemove(activeIndex)}
              className="p-2 mt-0.5 rounded-lg text-red-400 hover:bg-red-500/10"
              aria-label="Remove greeting"
              title="Remove this greeting"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
