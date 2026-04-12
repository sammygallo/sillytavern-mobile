import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Trash2, UserX, UserCheck, ShieldAlert } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { adminApi, type AdminUserInfo } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Avatar, Button } from '../ui';
import type { UserRole } from '../../types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'end_user', label: 'User' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
];

const ROLE_COLOR: Record<UserRole, string> = {
  owner: 'bg-amber-500/20 text-amber-400',
  admin: 'bg-purple-500/20 text-purple-400',
  contributor: 'bg-blue-500/20 text-blue-400',
  end_user: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]',
};

function getAvatarUrl(avatar: string) {
  if (!avatar) return undefined;
  if (avatar.startsWith('data:') || avatar.startsWith('http')) return avatar;
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

export function UserManagementPage(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const { currentUser } = useAuthStore();
  const isOwner = currentUser?.role === 'owner';

  const [users, setUsers] = useState<AdminUserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-user pending state: handle → action type
  const [pending, setPending] = useState<Record<string, 'role' | 'toggle' | 'delete'>>({});
  // Role select local state: handle → selected value (before save)
  const [roleSelections, setRoleSelections] = useState<Record<string, UserRole>>({});
  // Confirm delete state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await adminApi.getUsers();
      setUsers(list);
      // Seed role selections from loaded data
      const seeds: Record<string, UserRole> = {};
      list.forEach(u => { seeds[u.handle] = u.role; });
      setRoleSelections(seeds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetRole = async (handle: string) => {
    const newRole = roleSelections[handle];
    setPending(p => ({ ...p, [handle]: 'role' }));
    setError(null);
    try {
      await adminApi.setRole(handle, newRole);
      setUsers(prev => prev.map(u => u.handle === handle ? { ...u, role: newRole } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change role');
      // Revert selection on error
      setRoleSelections(prev => ({
        ...prev,
        [handle]: users.find(u => u.handle === handle)?.role ?? prev[handle],
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

  // Can the current user modify this target user?
  const canModify = (target: AdminUserInfo): boolean => {
    if (!currentUser) return false;
    if (target.handle === currentUser.handle) return false; // can't modify yourself
    if (target.handle === 'default-user') return false;
    // Admins can't modify owners
    if (target.role === 'owner' && !isOwner) return false;
    return true;
  };

  // Which roles can the current user assign?
  const assignableRoles = isOwner
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(r => r.value !== 'owner');

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
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
                const selectedRole = roleSelections[user.handle] ?? user.role;
                const roleChanged = selectedRole !== user.role;

                return (
                  <li key={user.handle} className={`px-4 py-3 ${!user.enabled ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar
                          src={getAvatarUrl(user.avatar)}
                          alt={user.name}
                          size="md"
                        />
                        {!user.enabled && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
                            <ShieldAlert size={10} className="text-red-400" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {user.name}
                          </span>
                          {isSelf && (
                            <span className="text-xs text-[var(--color-text-secondary)]">(you)</span>
                          )}
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLOR[user.role]}`}>
                            {user.role.replace('_', ' ')}
                          </span>
                          {!user.enabled && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                              disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">@{user.handle}</p>

                        {/* Role selector (only for modifiable users) */}
                        {modifiable && (
                          <div className="flex items-center gap-2 mt-2">
                            <select
                              value={selectedRole}
                              onChange={e => setRoleSelections(prev => ({ ...prev, [user.handle]: e.target.value as UserRole }))}
                              disabled={isPending}
                              className="text-xs bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                            >
                              {assignableRoles.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                              {/* Allow showing owner option as disabled for admins viewing an owner */}
                              {!isOwner && user.role === 'owner' && (
                                <option value="owner" disabled>Owner</option>
                              )}
                            </select>
                            {roleChanged && (
                              <Button
                                size="sm"
                                onClick={() => handleSetRole(user.handle)}
                                disabled={isPending}
                                className="text-xs py-1 px-2"
                              >
                                {pending[user.handle] === 'role'
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : 'Save'}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {modifiable && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Enable / Disable */}
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

                          {/* Delete */}
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
