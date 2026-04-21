import { useEffect, useState } from 'react';
import { BookOpen, User } from 'lucide-react';
import { usePersonaStore, type PersonaDescriptionPosition, type PersonaDescriptionRole, type Persona } from '../../stores/personaStore';
import { useWorldInfoStore } from '../../stores/worldInfoStore';
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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [descriptionPosition, setDescriptionPosition] =
    useState<PersonaDescriptionPosition>('before_char');
  const [descriptionDepth, setDescriptionDepth] = useState(4);
  const [descriptionRole, setDescriptionRole] = useState<PersonaDescriptionRole>('system');
  const [isDefault, setIsDefault] = useState(false);
  const [linkedBookIds, setLinkedBookIds] = useState<string[]>([]);

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
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
          {candidateBooks.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No global lorebooks exist yet. Create some in Settings → World Info.
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
