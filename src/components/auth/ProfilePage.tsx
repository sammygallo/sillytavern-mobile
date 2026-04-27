import { useState, useRef } from 'react';
import { ArrowLeft, Camera, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import { Avatar, Button, Input } from '../ui';
import type { UserRole } from '../../types';

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  contributor: 'Contributor',
  end_user: 'User',
};

const ROLE_COLOR: Record<UserRole, string> = {
  owner: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  admin: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  contributor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  end_user: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]',
};

export function ProfilePage() {
  const navigate = useNavigate();
  const { currentUser, updateCurrentUser } = useAuthStore();

  const [displayName, setDisplayName] = useState(currentUser?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === currentUser.name) return;
    setNameSaving(true);
    setNameError(null);
    setNameSuccess(false);
    try {
      await api.changeName(currentUser.handle, trimmed);
      updateCurrentUser({ name: trimmed });
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setNameSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      setPwdError('Passwords do not match');
      return;
    }
    setPwdSaving(true);
    setPwdError(null);
    setPwdSuccess(false);
    try {
      await api.changePassword(currentUser.handle, oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdSuccess(true);
      setTimeout(() => setPwdSuccess(false), 3000);
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarSaving(true);
    setAvatarError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await api.changeAvatar(currentUser.handle, dataUrl);
        updateCurrentUser({ avatar: dataUrl });
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Failed to upload avatar');
      } finally {
        setAvatarSaving(false);
        // Reset so the same file can be re-selected
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center pl-4 pr-14 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="p-2" aria-label="Back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Profile</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        {/* Identity card */}
        <div className="flex flex-col items-center gap-3 pt-4 pb-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarSaving}
            className="relative group focus:outline-none"
            aria-label="Change avatar"
          >
            <Avatar src={currentUser.avatar} alt={currentUser.name} size="xl" />
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
              {avatarSaving
                ? <Loader2 size={20} className="animate-spin text-white" />
                : <Camera size={20} className="text-white" />}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
          {avatarError && <p className="text-xs text-red-400 text-center">{avatarError}</p>}
          <div className="text-center">
            <p className="font-semibold text-[var(--color-text-primary)]">{currentUser.name}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">@{currentUser.handle}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ROLE_COLOR[currentUser.role]}`}>
            {ROLE_LABEL[currentUser.role]}
          </span>
        </div>

        {/* Display name */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Display Name</h2>
          <div className="flex gap-2">
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            />
            <Button
              onClick={handleSaveName}
              disabled={nameSaving || !displayName.trim() || displayName.trim() === currentUser.name}
              size="sm"
              className="min-w-[60px]"
            >
              {nameSaving
                ? <Loader2 size={16} className="animate-spin" />
                : nameSuccess
                  ? <Check size={16} />
                  : 'Save'}
            </Button>
          </div>
          {nameError && <p className="text-xs text-red-400">{nameError}</p>}
        </div>

        {/* Change password */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Change Password</h2>
          <Input
            type="password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            placeholder="Current password (leave blank if none set)"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="New password"
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            onKeyDown={e => e.key === 'Enter' && handleSavePassword()}
          />
          {pwdError && <p className="text-xs text-red-400">{pwdError}</p>}
          <Button
            onClick={handleSavePassword}
            disabled={pwdSaving || !newPassword}
            className="w-full"
          >
            {pwdSaving && <Loader2 size={16} className="animate-spin mr-2" />}
            {pwdSuccess && <Check size={16} className="mr-2" />}
            {pwdSuccess ? 'Password updated' : 'Change Password'}
          </Button>
        </div>
      </div>
    </div>
  );
}
