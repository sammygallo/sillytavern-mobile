import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader2, Trash2, UserX, UserCheck, ShieldAlert } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { adminApi, permissionGroupsApi, type AdminUserInfo } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../utils/permissions';
import { Avatar, Button } from '../ui';
import type { PermissionGroup } from '../../types';

const GROUP_BADGE_COLOR: Record<string, string> = {
  'owner-default': 'bg-amber-500/20 text-amber-400',
  'admin-default': 'bg-purple-500/20 text-purple-400',
  'contributor-default': 'bg-blue-500/20 text-blue-400',
  'end-user-default': 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]',
};

function groupBadgeColor(id: string | null | undefined): string {
  if (!id) return 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]';
  return GROUP_BADGE_COLOR[id] || 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]';
}

function getAvatarUrl(avatar: string) {
  if (!avatar) return undefined;
  if (avatar.startsWith('data:') || avatar.startsWith('http')) return avatar;
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

export function UserManagementPage(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const { currentUser } = useAuthStore();
  const canSetGroup = hasPermission(currentUser, 'admin:users:set_group');
  const canManageUsers = hasPermission(currentUser, 'admin:users:manage');
  const actorPermSet = useMemo(
    () => new Set(currentUser?.permissions ?? []),
    [currentUser?.permissions],
  );

  const [users, setUsers] = useState<AdminUserInfo[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-user pending state: handle → action type
  const [pending, setPending] = useState<Record<string, 'group' | 'toggle' | 'delete'>>({});
  // Group select local state: handle → selected group id (before save)
  const [groupSelections, setGroupSelections] = useState<Record<string, string>>({});
  // Confirm delete state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [userList, groupList] = await Promise.all([
        adminApi.getUsers(),
        permissionGroupsApi.list(),
      ]);
      setUsers(userList);
      setGroups(groupList);
      // Seed group selections from loaded data
      const seeds: Record<string, string> = {};
      userList.forEach(u => {
        if (u.groupId) seeds[u.handle] = u.groupId;
      });
      setGroupSelections(seeds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetGroup = async (handle: string) => {
    const newGroupId = groupSelections[handle];
    if (!newGroupId) return;
    setPending(p => ({ ...p, [handle]: 'group' }));
    setError(null);
    try {
      await adminApi.setUserGroup(handle, newGroupId);
      setUsers(prev => prev.map(u => u.handle === handle ? { ...u, groupId: newGroupId } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change group');
      setGroupSelections(prev => ({
        ...prev,
        [handle]: users.find(u => u.handle === handle)?.groupId ?? prev[handle],
      }));
    } finally {
      setPending(p => { const next = { ...p }; delete next[handle]; return next; });
    }
  };

  const handleToggleEnabled = async (user: AdminUserInfo) => {
    setPending(p => ({ ...p, [user.handle]: 'toggle' }));
    setError(null);
    try {
      if (user.enabled) {
        await adminApi.disableUser(user.handle);
      } else {
        await adminApi.enableUser(user.handle);
      }
      setUsers(prev => prev.map(u => u.handle === user.handle ? { ...u, enabled: !u.enabled } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    } finally {
      setPending(p => { const next = { ...p }; delete next[user.handle]; return next; });
    }
  };

  const handleDelete = async (handle: string) => {
    setConfirmDelete(null);
    setPending(p => ({ ...p, [handle]: 'delete' }));
    setError(null);
    try {
      await adminApi.deleteUser(handle);
      setUsers(prev => prev.filter(u => u.handle !== handle));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
    } finally {
      setPending(p => { const next = { ...p }; delete next[handle]; return next; });
    }
  };

  // A group is assignable by the current actor iff every permission in the
  // group is held by the actor (mirrors the backend canAssignGroup rule).
  const isGroupAssignable = useCallback(
    (group: PermissionGroup) => group.permissions.every(p => actorPermSet.has(p)),
    [actorPermSet],
  );

  // Can the current user modify this target user?
  const canModify = (target: AdminUserInfo): boolean => {
    if (!currentUser) return false;
    if (target.handle === currentUser.handle) return false;
    if (target.handle === 'default-user') return false;
    return canManageUsers || canSetGroup;
  };

  const groupName = (id: string | null | undefined) => {
    if (!id) return 'unknown';
    return groups.find(g => g.id === id)?.name ?? id;
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="sticky top-0 z-10 h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center pl-4 pr-14 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => goBack()} className="p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Users</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <div className="bg-[var(--color-bg-secondary)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                All Users ({users.length})
              </h2>
            </div>

            <ul className="divide-y divide-[var(--color-border)]">
              {users.map(user => {
                const isSelf = user.handle === currentUser?.handle;
                const modifiable = canModify(user);
                const isPending = !!pending[user.handle];
                const selectedGroupId = groupSelections[user.handle] ?? user.groupId ?? '';
                const groupChanged = selectedGroupId !== user.groupId;

                return (
                  <li key={user.handle} className={`px-4 py-3 ${!user.enabled ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar src={getAvatarUrl(user.avatar)} alt={user.name} size="md" />
                        {!user.enabled && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
                            <ShieldAlert size={10} className="text-red-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {user.name}
                          </span>
                          {isSelf && (
                            <span className="text-xs text-[var(--color-text-secondary)]">(you)</span>
                          )}
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${groupBadgeColor(user.groupId)}`}>
                            {groupName(user.groupId)}
                          </span>
                          {!user.enabled && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                              disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">@{user.handle}</p>

                        {/* Group selector (only for modifiable users with canSetGroup) */}
                        {modifiable && canSetGroup && (
                          <div className="flex items-center gap-2 mt-2">
                            <select
                              value={selectedGroupId}
                              onChange={e => setGroupSelections(prev => ({ ...prev, [user.handle]: e.target.value }))}
                              disabled={isPending}
                              className="text-xs bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                            >
                              {groups.map(g => {
                                const assignable = isGroupAssignable(g);
                                const isCurrent = g.id === user.groupId;
                                return (
                                  <option key={g.id} value={g.id} disabled={!assignable && !isCurrent}>
                                    {g.name}{!assignable && !isCurrent ? ' (requires more perms)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            {groupChanged && (
                              <Button
                                size="sm"
                                onClick={() => handleSetGroup(user.handle)}
                                disabled={isPending}
                                className="text-xs py-1 px-2"
                              >
                                {pending[user.handle] === 'group'
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : 'Save'}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {modifiable && canManageUsers && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleToggleEnabled(user)}
                            disabled={isPending}
                            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                            aria-label={user.enabled ? 'Disable user' : 'Enable user'}
                            title={user.enabled ? 'Disable user' : 'Enable user'}
                          >
                            {pending[user.handle] === 'toggle'
                              ? <Loader2 size={16} className="animate-spin" />
                              : user.enabled
                                ? <UserX size={16} />
                                : <UserCheck size={16} className="text-green-400" />}
                          </button>

                          {confirmDelete === user.handle ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(user.handle)}
                                disabled={isPending}
                                className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                              >
                                {pending[user.handle] === 'delete'
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-xs px-2 py-1 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(user.handle)}
                              disabled={isPending}
                              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                              aria-label="Delete user"
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
