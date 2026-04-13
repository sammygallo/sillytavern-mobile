import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Copy, Check, Loader2, Plus, Trash2, UserPlus } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { invitationsApi, type Invitation } from '../../api/client';
import { Button } from '../ui';
import type { UserRole } from '../../types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'end_user', label: 'User' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_COLOR: Record<Invitation['status'], string> = {
  pending: 'text-green-400',
  accepted: 'text-[var(--color-text-secondary)]',
  revoked: 'text-red-400',
};

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function InvitationManager(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [createRole, setCreateRole] = useState<UserRole>('end_user');
  const [createLabel, setCreateLabel] = useState('');
  const [createExpiry, setCreateExpiry] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Per-invite copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      const list = await invitationsApi.list();
      setInvitations(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invitations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const expiresIn = createExpiry ? Number(createExpiry) : undefined;
      const invite = await invitationsApi.create(createRole, createLabel.trim(), expiresIn);
      setInvitations(prev => [invite, ...prev]);
      setCreateLabel('');
      setCreateExpiry('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invitation');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const updated = await invitationsApi.revoke(id);
      setInvitations(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke invitation');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invitationsApi.delete(id);
      setInvitations(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete invitation');
    }
  };

  const handleCopy = async (invite: Invitation) => {
    await navigator.clipboard.writeText(inviteUrl(invite.token));
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => goBack()} className="p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Invitations</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Create invite */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Create Invite Link</h2>

          <div className="flex gap-2">
            <select
              value={createRole}
              onChange={e => setCreateRole(e.target.value as UserRole)}
              className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={createExpiry}
              onChange={e => setCreateExpiry(e.target.value)}
              className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">No expiry</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </select>
          </div>

          <input
            type="text"
            value={createLabel}
            onChange={e => setCreateLabel(e.target.value)}
            placeholder="Label (optional note)"
            maxLength={200}
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />

          <Button onClick={handleCreate} disabled={isCreating} className="w-full">
            {isCreating
              ? <Loader2 size={16} className="animate-spin mr-2" />
              : <Plus size={16} className="mr-2" />}
            Create Link
          </Button>
        </div>

        {/* Invite list */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">All Invitations</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-[var(--color-text-secondary)]">
              <UserPlus size={32} className="opacity-40" />
              <p className="text-sm">No invitations yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {invitations.map(invite => (
                <li key={invite.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-[var(--color-text-primary)] capitalize">
                          {invite.role.replace('_', ' ')}
                        </span>
                        <span className={`text-xs capitalize ${STATUS_COLOR[invite.status]}`}>
                          {invite.status}
                        </span>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {timeAgo(invite.createdAt)}
                        </span>
                      </div>
                      {invite.label && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                          {invite.label}
                        </p>
                      )}
                      {invite.status === 'accepted' && invite.usedBy && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          Accepted by @{invite.usedBy}
                        </p>
                      )}
                      {invite.expiresAt && invite.status === 'pending' && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {invite.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleCopy(invite)}
                            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                            aria-label="Copy invite link"
                          >
                            {copiedId === invite.id
                              ? <Check size={16} className="text-green-400" />
                              : <Copy size={16} />}
                          </button>
                          <button
                            onClick={() => handleRevoke(invite.id)}
                            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] transition-colors"
                            aria-label="Revoke invitation"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      {invite.status !== 'pending' && (
                        <button
                          onClick={() => handleDelete(invite.id)}
                          className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] transition-colors"
                          aria-label="Delete invitation"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
