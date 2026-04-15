import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2, Lock, Shield, Users as UsersIcon } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { permissionGroupsApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../utils/permissions';
import { Button } from '../ui';
import type { PermissionGroup, Permission } from '../../types';
import { PermissionGroupEditor } from './PermissionGroupEditor';

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; group: PermissionGroup };

/**
 * Permission Groups management page.
 *
 * Lists every permission group. Owner-role users can create, edit, and
 * delete custom groups. The four seeded groups (Owner, Admin, Contributor,
 * End User) are marked with a "system" badge and cannot be deleted. The
 * Owner group additionally has a "locked" badge and its permission set is
 * read-only in the editor.
 */
export function PermissionGroupsPage(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const { currentUser } = useAuthStore();

  const canManageGroups = hasPermission(currentUser, 'admin:groups:manage');

  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [vocabulary, setVocabulary] = useState<{
    permissions: Permission[];
    categories: Record<string, Permission[]>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [list, vocab] = await Promise.all([
        permissionGroupsApi.list(),
        permissionGroupsApi.getVocabulary(),
      ]);
      setGroups(list);
      setVocabulary(vocab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load permission groups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    setPendingDelete(id);
    setError(null);
    try {
      await permissionGroupsApi.delete(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete group');
    } finally {
      setPendingDelete(null);
    }
  };

  const handleSave = async () => {
    setEditor({ kind: 'closed' });
    await load();
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => goBack()} className="p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold text-[var(--color-text-primary)] flex-1">
          Permission Groups
        </h1>
        {canManageGroups && (
          <Button
            size="sm"
            onClick={() => setEditor({ kind: 'create' })}
            className="text-xs py-1 px-2 flex items-center gap-1"
          >
            <Plus size={14} />
            New
          </Button>
        )}
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {!canManageGroups && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
            You have read-only access to permission groups. Only users with the
            <code className="mx-1 px-1 bg-black/20 rounded">admin:groups:manage</code>
            permission can create or edit groups.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map(group => {
              const isDeleting = pendingDelete === group.id;
              const isSystemOwner = group.systemOwner;
              const isSystem = group.system;
              const canDelete = canManageGroups && !isSystem && (group.memberCount ?? 0) === 0;
              return (
                <li
                  key={group.id}
                  className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {group.name}
                          </span>
                          {isSystemOwner && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                              <Shield size={10} />
                              Owner
                            </span>
                          )}
                          {isSystem && !isSystemOwner && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                              system
                            </span>
                          )}
                          {isSystemOwner && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] flex items-center gap-1">
                              <Lock size={10} />
                              locked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {group.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-text-secondary)]">
                          <span>{group.permissions.length} permission{group.permissions.length === 1 ? '' : 's'}</span>
                          {group.memberCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <UsersIcon size={11} />
                              {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>

                      {canManageGroups && (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditor({ kind: 'edit', group })}
                            className="text-xs py-1 px-2"
                          >
                            {isSystemOwner ? 'View' : 'Edit'}
                          </Button>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(group.id)}
                              disabled={isDeleting}
                              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                              aria-label="Delete group"
                              title="Delete group"
                            >
                              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editor.kind !== 'closed' && vocabulary && (
        <PermissionGroupEditor
          mode={editor.kind}
          group={editor.kind === 'edit' ? editor.group : null}
          vocabulary={vocabulary}
          onClose={() => setEditor({ kind: 'closed' })}
          onSave={handleSave}
          readOnly={editor.kind === 'edit' && editor.group.systemOwner}
          currentUserPermissions={currentUser?.permissions ?? []}
        />
      )}
    </div>
  );
}
