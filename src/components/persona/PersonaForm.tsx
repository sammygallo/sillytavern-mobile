import { useEffect, useRef, useState } from 'react';
import { BookOpen, Upload, User } from 'lucide-react';
import { usePersonaStore, type PersonaDescriptionPosition, type PersonaDescriptionRole, type Persona } from '../../stores/personaStore';
import { useWorldInfoStore } from '../../stores/worldInfoStore';
import { extractCharacterFromPNG, parseCharacterFromJSON } from '../../utils/characterCard';
import { Button, Input, TextArea, ImageUpload } from '../ui';

interface PersonaFormProps {
  persona?: Persona | null;
  onClose: () => void;
  onSaved?: () => void;
  initialValues?: {
    name?: string;
    description?: string;
  };
}

export function PersonaForm({ persona, onClose, onSaved, initialValues }: PersonaFormProps) {
  const { createPersona, updatePersona } = usePersonaStore();
  const importBookJson = useWorldInfoStore((s) => s.importBookJson);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [descriptionPosition, setDescriptionPosition] =
    useState<PersonaDescriptionPosition>('before_char');
  const [descriptionDepth, setDescriptionDepth] = useState(4);
  const [descriptionRole, setDescriptionRole] = useState<PersonaDescriptionRole>('system');
  const [isDefault, setIsDefault] = useState(false);
  const [linkedBookIds, setLinkedBookIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const personaImportInputRef = useRef<HTMLInputElement>(null);
  const lorebookImportInputRef = useRef<HTMLInputElement>(null);

  const books = useWorldInfoStore((s) => s.books);
  // Only global (non-character-owned) books are picker-eligible — linking
  // another character's embedded book from a persona would be surprising.
  const candidateBooks = books.filter((b) => b.ownerCharacterAvatar == null);

  useEffect(() => {
    if (persona) {
      setName(persona.name);
      setDescription(persona.description);
      setAvatarDataUrl(persona.avatarDataUrl);
      setDescriptionPosition(persona.descriptionPosition);
      setDescriptionDepth(persona.descriptionDepth);
      setDescriptionRole(persona.descriptionRole);
      setIsDefault(!!persona.isDefault);
      setLinkedBookIds(persona.linkedBookIds ?? []);
    } else {
      setName(initialValues?.name || '');
      setDescription(initialValues?.description || '');
      setAvatarDataUrl(undefined);
      setDescriptionPosition('before_char');
      setDescriptionDepth(4);
      setDescriptionRole('system');
      setIsDefault(false);
      setLinkedBookIds([]);
    }
  }, [persona, initialValues]);

  const handleAvatarSelect = async (file: File | null) => {
    if (!file) {
      setAvatarDataUrl(undefined);
      return;
    }
    // Resize to small size and convert to data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setAvatarDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handlePersonaImport = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setImportNotice(null);

    const lower = file.name.toLowerCase();
    const isPng = lower.endsWith('.png') || file.type === 'image/png';
    const isJson = lower.endsWith('.json') || file.type === 'application/json';

    try {
      if (isPng) {
        const extracted = await extractCharacterFromPNG(file);
        if (!extracted) {
          setImportError('No persona data found in this PNG.');
          return;
        }
        const srcName = 'data' in extracted ? extracted.data.name : extracted.name;
        const srcDesc =
          'data' in extracted ? extracted.data.description : extracted.description;
        setName(srcName || '');
        setDescription(srcDesc || '');
        setAvatarDataUrl(await readFileAsDataUrl(file));
        setImportNotice(`Imported "${srcName || 'persona'}" from PNG.`);
        return;
      }

      if (isJson) {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const looksLikeCharacterCard =
          typeof raw.spec === 'string' ||
          typeof raw.first_mes === 'string' ||
          typeof raw.personality === 'string' ||
          typeof raw.scenario === 'string';

        if (looksLikeCharacterCard) {
          const parsed = await parseCharacterFromJSON(file);
          const srcName = 'data' in parsed ? parsed.data.name : parsed.name;
          const srcDesc =
            'data' in parsed ? parsed.data.description : parsed.description;
          setName(srcName || '');
          setDescription(srcDesc || '');
          setImportNotice(`Imported "${srcName || 'persona'}" from JSON.`);
          return;
        }

        const rawName = typeof raw.name === 'string' ? raw.name : '';
        const rawDesc =
          typeof raw.description === 'string' ? raw.description : '';
        if (!rawName && !rawDesc) {
          setImportError('JSON file has no persona fields to import.');
          return;
        }
        setName(rawName);
        setDescription(rawDesc);
        if (typeof raw.avatar === 'string' && raw.avatar.startsWith('data:')) {
          setAvatarDataUrl(raw.avatar);
        }
        if (typeof raw.position === 'string') {
          setDescriptionPosition(raw.position as PersonaDescriptionPosition);
        }
        if (typeof raw.depth === 'number') setDescriptionDepth(raw.depth);
        if (typeof raw.role === 'string') {
          setDescriptionRole(raw.role as PersonaDescriptionRole);
        }
        setImportNotice(`Imported "${rawName || 'persona'}" from JSON.`);
        return;
      }

      setImportError('Unsupported file type. Use .json or .png.');
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to import persona.'
      );
    }
  };

  const handleLorebookUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setImportNotice(null);

    try {
      const json = await file.text();
      const fallback = file.name.replace(/\.json$/i, '') || 'Imported Lorebook';
      const book = importBookJson(json, fallback);
      if (!book) {
        setImportError('Could not parse lorebook JSON.');
        return;
      }
      setLinkedBookIds((prev) =>
        prev.includes(book.id) ? prev : [...prev, book.id]
      );
      setImportNotice(`Linked "${book.name}" (${book.entries.length} entries).`);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to upload lorebook.'
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data = {
      name: name.trim(),
      description: description.trim(),
      avatarDataUrl,
      descriptionPosition,
      descriptionDepth,
      descriptionRole,
      isDefault,
      linkedBookIds,
    };

    if (persona) {
      updatePersona(persona.id, data);
    } else {
      createPersona(data);
    }
    onSaved?.();
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        ref={personaImportInputRef}
        type="file"
        accept=".json,application/json,.png,image/png"
        className="hidden"
        onChange={handlePersonaImport}
      />
      <input
        ref={lorebookImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleLorebookUpload}
      />

      {!persona && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Import persona
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Pre-fill this form from a JSON persona file or a character card PNG.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => personaImportInputRef.current?.click()}
            className="shrink-0"
          >
            <Upload size={14} className="mr-1.5" />
            Import
          </Button>
        </div>
      )}

      {(importError || importNotice) && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            importError
              ? 'border-red-500/40 bg-red-500/10 text-[var(--color-text-primary)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
          }`}
          role={importError ? 'alert' : 'status'}
        >
          {importError || importNotice}
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--color-bg-tertiary)] flex items-center justify-center border-2 border-[var(--color-border)] flex-shrink-0">
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Persona avatar" className="w-full h-full object-cover" />
          ) : (
            <User size={36} className="text-[var(--color-text-secondary)]" />
          )}
        </div>
        <div className="flex-1">
          <ImageUpload
            currentImage={avatarDataUrl}
            onImageSelect={handleAvatarSelect}
            label="Avatar (optional)"
          />
        </div>
      </div>

      <Input
        label="Name *"
        placeholder="e.g., Alex, Dungeon Master, Narrator"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />

      <TextArea
        label="Description"
        placeholder="Describe who you are when using this persona..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
      />

      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
          Description Position
        </label>
        <select
          value={descriptionPosition}
          onChange={(e) =>
            setDescriptionPosition(e.target.value as PersonaDescriptionPosition)
          }
          className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          <option value="in_prompt">In system prompt</option>
          <option value="before_char">Before character info</option>
          <option value="after_char">After character info</option>
          <option value="at_depth">At specific depth in chat</option>
        </select>
      </div>

      {descriptionPosition === 'at_depth' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Injection Depth
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={descriptionDepth}
              onChange={(e) => setDescriptionDepth(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Role
            </label>
            <select
              value={descriptionRole}
              onChange={(e) =>
                setDescriptionRole(e.target.value as PersonaDescriptionRole)
              }
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="system">System</option>
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
            </select>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)]">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-primary)]"
        />
        Set as default persona
      </label>

      {/* Persona lorebooks — auto-activated whenever this persona is active */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--color-text-secondary)]" />
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
            Lorebooks
          </h3>
          <button
            type="button"
            onClick={() => lorebookImportInputRef.current?.click()}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] border border-[var(--color-border)]"
          >
            <Upload size={12} />
            Upload Lorebook
          </button>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
          {candidateBooks.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No global lorebooks yet. Use Upload Lorebook to add one, or create them in Settings → World Info.
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
                        onChange={() =>
                          setLinkedBookIds(
                            checked
                              ? linkedBookIds.filter((id) => id !== book.id)
                              : [...linkedBookIds, book.id]
                          )
                        }
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
            Linked books are auto-activated whenever this persona is active.
          </p>
        </div>
      </section>

      <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim()}
          className="flex-1"
        >
          {persona ? 'Save Changes' : 'Create Persona'}
        </Button>
      </div>
    </form>
  );
}
