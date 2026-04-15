import { useState, useMemo } from 'react';
import { X, Loader2, Lock } from 'lucide-react';
import { permissionGroupsApi } from '../../api/client';
import { Button } from '../ui';
import type { PermissionGroup, Permission } from '../../types';

interface PermissionGroupEditorProps {
  mode: 'create' | 'edit';
  group: PermissionGroup | null;
  vocabulary: {
    permissions: Permission[];
    categories: Record<string, Permission[]>;
  };
  /**
   * Permissions the editing user currently holds. Used to gate which
   * permissions can be added — you cannot add a permission you don't hold
   * yourself (mirrors the backend canEditGroup rule).
   */
  currentUserPermissions: Permission[];
  /** If true, all fields are read-only (e.g. systemOwner group). */
  readOnly: boolean;
  onClose: () => void;
  onSave: () => void;
}

/**
 * Modal editor for a permission group.
 *
 * Renders a form with name / description / a checkbox tree for each
 * permission category. On save, calls the appropriate API and closes.
 *
 * Permissions the current user does not hold are shown as disabled
 * checkboxes with a "requires X" tooltip — clicking them is a no-op. If a
 * group already holds such a permission (inherited from a higher-privilege
 * admin), the checkbox stays checked but also disabled, so the current
 * editor can't strip it accidentally.
 */
export function PermissionGroupEditor({
  mode,
  group,
  vocabulary,
  currentUserPermissions,
  readOnly,
  onClose,
  onSave,
}: PermissionGroupEditorProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [selectedPerms, setSelectedPerms] = useState<Set<Permission>>(
    new Set(group?.permissions ?? []),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actorPermSet = useMemo(() => new Set(currentUserPermissions), [currentUserPermissions]);

  const togglePerm = (perm: Permission) => {
    if (readOnly) return;
    // If the editor doesn't hold this perm and it's not already on the
    // group, they can't add it.
    if (!actorPermSet.has(perm) && !selectedPerms.has(perm)) return;
    // If the editor doesn't hold it but the group already does, they also
    // can't remove it (that would strip a permission they can't re-grant).
    if (!actorPermSet.has(perm) && selectedPerms.has(perm)) return;

    const next = new Set(selectedPerms);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setSelectedPerms(next);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        permissions: Array.from(selectedPerms),
      };
      if (mode === 'create') {
        await permissionGroupsApi.create(payload);
      } else if (group) {
        await permissionGroupsApi.update(group.id, payload);
      }
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save group');
    } finally {
      setIsSaving(false);
    }
  };

  const title = mode === 'create'
    ? 'New Permission Group'
    : readOnly
      ? `View: ${group?.name}`
      : `Edit: ${group?.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-[var(--color-border)] flex items-center px-4 gap-3 shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex-1 truncate">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {readOnly && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
              <Lock size={14} className="shrink-0 mt-0.5" />
              <span>
                This is the system Owner group. Its permission set is locked to
                the full vocabulary and cannot be edited. The name and
                description can be changed using the backend directly.
              </span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={readOnly}
              maxLength={80}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
              placeholder="e.g. Reviewers"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={readOnly}
              maxLength={500}
              rows={2}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 resize-none"
              placeholder="What can members of this group do?"
            />
          </div>

          {/* Permissions by category */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Permissions ({selectedPerms.size} selected)
            </label>
            <div className="space-y-3">
              {Object.entries(vocabulary.categories).map(([category, perms]) => (
                <div key={category} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-primary)]">
                    {category}
                  </div>
                  <div className="p-2 space-y-1">
                    {perms.map(perm => {
                      const isSelected = selectedPerms.has(perm);
                      const canToggle =
                        !readOnly && actorPermSet.has(perm);
                      const disabled = readOnly || !canToggle;
                      return (
                        <label
                          key={perm}
                          className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--color-bg-tertiary)]'}`}
                          title={!canToggle && !readOnly ? 'You do not hold this permission yourself' : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => togglePerm(perm)}
                            className="rounded border-[var(--color-border)]"
                          />
                          <code className="text-[var(--color-text-primary)]">{perm}</code>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-[var(--color-border)] flex items-center justify-end gap-2 px-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
