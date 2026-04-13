import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Copy,
  Edit3,
  Globe,
  Loader2,
  Lock,
  Search,
  Trash2,
} from 'lucide-react';
import { useCharacterStore } from '../../stores/characterStore';
import { useCharacterOwnershipStore, type CharacterOwnershipState } from '../../stores/characterOwnershipStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { can } from '../../utils/permissions';
import { api, type CharacterInfo } from '../../api/client';
import { Button, ConfirmDialog } from '../ui';
import { CharacterEdit } from '../character/CharacterEdit';

type FilterMode = 'all' | 'mine';

export function CharacterManagementPage() {
  const { goBack } = useSettingsPanelStore();
  const { characters, fetchCharacters, deleteCharacter, duplicateCharacter } =
    useCharacterStore();
  const ownershipStore = useCharacterOwnershipStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  const userHandle = currentUser?.handle ?? '';
  const userRole = currentUser?.role;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [editingCharacter, setEditingCharacter] = useState<CharacterInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  // Filtered + sorted character list
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return characters
      .filter((char) => {
        if (filterMode === 'mine' && !ownershipStore.isOwnedBy(char.avatar, userHandle)) {
          return false;
        }
        if (query) {
          const name = (char.name || '').toLowerCase();
          const creator = (char.creator || char.data?.creator || '').toLowerCase();
          if (!name.includes(query) && !creator.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [characters, searchQuery, filterMode, ownershipStore, userHandle]);

  // Open edit modal — needs full character data
  const handleEdit = async (avatar: string) => {
    setIsLoadingEdit(true);
    try {
      const full = await api.getCharacter(avatar);
      setEditingCharacter(full);
    } catch {
      // fall back to partial data from list
      const partial = characters.find((c) => c.avatar === avatar) ?? null;
      setEditingCharacter(partial);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleDuplicate = async (avatar: string) => {
    const newAvatar = await duplicateCharacter(avatar);
    if (newAvatar) {
      // Copy original visibility to the duplicate
      const originalVisibility = ownershipStore.getVisibility(avatar);
      ownershipStore.setOwner(newAvatar, userHandle);
      ownershipStore.setVisibility(newAvatar, originalVisibility);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await deleteCharacter(deleteTarget);
    setDeleteTarget(null);
    setIsDeleting(false);
  };

  const handleToggleVisibility = (avatar: string) => {
    const current = ownershipStore.getVisibility(avatar);
    ownershipStore.setVisibility(avatar, current === 'global' ? 'personal' : 'global');
  };

  const deleteTargetName =
    characters.find((c) => c.avatar === deleteTarget)?.name ?? 'this character';

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => goBack()} className="p-2" aria-label="Back">
          <ArrowLeft size={24} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Character Management
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {characters.length} character{characters.length !== 1 ? 's' : ''}
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Search + Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
            />
            <input
              type="text"
              placeholder="Search characters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
            {(['all', 'mine'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filterMode === mode
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {mode === 'all' ? 'All' : 'Mine'}
              </button>
            ))}
          </div>
        </div>

        {/* Loading indicator for edit */}
        {isLoadingEdit && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
            <span className="ml-2 text-sm text-[var(--color-text-secondary)]">Loading character...</span>
          </div>
        )}

        {/* Character list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {searchQuery || filterMode === 'mine'
                ? 'No characters match your filters.'
                : 'No characters yet. Create one from the sidebar.'}
            </p>
          </div>
        ) : (
          <ul className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
            {filtered.map((char) => (
              <CharacterRow
                key={char.avatar}
                character={char}
                userHandle={userHandle}
                userRole={userRole}
                ownershipStore={ownershipStore}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={setDeleteTarget}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Edit modal */}
      {editingCharacter && (
        <CharacterEdit
          isOpen
          onClose={() => setEditingCharacter(null)}
          character={editingCharacter}
          onSaved={() => {
            setEditingCharacter(null);
            fetchCharacters();
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Character"
        message={`Are you sure you want to delete "${deleteTargetName}"? This action cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        danger
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual character row
// ---------------------------------------------------------------------------

interface CharacterRowProps {
  character: CharacterInfo;
  userHandle: string;
  userRole: string | undefined;
  ownershipStore: CharacterOwnershipState;
  onEdit: (avatar: string) => void;
  onDuplicate: (avatar: string) => void;
  onDelete: (avatar: string) => void;
  onToggleVisibility: (avatar: string) => void;
}

function CharacterRow({
  character,
  userHandle,
  userRole,
  ownershipStore,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleVisibility,
}: CharacterRowProps) {
  const avatar = character.avatar;
  const visibility = ownershipStore.getVisibility(avatar);
  const isOwned = ownershipStore.isOwnedBy(avatar, userHandle);
  const ownerHandle = ownershipStore.getOwner(avatar);

  const canEdit = ownershipStore.canEditCharacter(avatar, userHandle, userRole as any);
  const canDelete = ownershipStore.canDeleteCharacter(avatar, userHandle, userRole as any);
  const canDuplicate = can(userRole as any, 'character:create');

  const creator = character.creator || character.data?.creator || null;
  const thumbnailUrl = `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-bg-tertiary)] flex-shrink-0">
          <img
            src={thumbnailUrl}
            alt={character.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {character.name}
            </p>
            {/* Visibility badge */}
            {visibility === 'global' ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/20 text-blue-400">
                GLOBAL
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/20 text-amber-400">
                PERSONAL
              </span>
            )}
            {/* Ownership badge */}
            {isOwned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-500/20 text-green-400">
                YOURS
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
            {creator ? `by ${creator}` : ownerHandle ? `owned by ${ownerHandle}` : 'No owner'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {canEdit && (
            <button
              onClick={() => onEdit(avatar)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              title="Edit"
              aria-label={`Edit ${character.name}`}
            >
              <Edit3 size={14} />
            </button>
          )}
          {canDuplicate && (
            <button
              onClick={() => onDuplicate(avatar)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              title="Duplicate"
              aria-label={`Duplicate ${character.name}`}
            >
              <Copy size={14} />
            </button>
          )}
          {isOwned && (
            <button
              onClick={() => onToggleVisibility(avatar)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              title={visibility === 'global' ? 'Make personal' : 'Make global'}
              aria-label={`Toggle visibility for ${character.name}`}
            >
              {visibility === 'global' ? <Globe size={14} /> : <Lock size={14} />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(avatar)}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete"
              aria-label={`Delete ${character.name}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
