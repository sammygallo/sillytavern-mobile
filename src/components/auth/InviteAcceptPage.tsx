import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { invitationsApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input } from '../ui';

type Stage = 'validating' | 'invalid' | 'form' | 'creating' | 'done' | 'error';

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);

  const [stage, setStage] = useState<Stage>('validating');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteLabel, setInviteLabel] = useState('');
  const [invalidReason, setInvalidReason] = useState('');

  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [doneHandle, setDoneHandle] = useState('');

  useEffect(() => {
    if (!token) {
      setInvalidReason('No invite token provided.');
      setStage('invalid');
      return;
    }
    invitationsApi.validate(token).then(result => {
      if (result.valid) {
        setInviteRole(result.role ?? '');
        setInviteLabel(result.label ?? '');
        setStage('form');
      } else {
        setInvalidReason(result.error ?? 'Invalid or expired invite link.');
        setStage('invalid');
      }
    }).catch(() => {
      setInvalidReason('Could not validate invite link. Please try again.');
      setStage('invalid');
    });
  }, [token]);

  const handleSubmit = async () => {
    setFieldError(null);
    const trimHandle = handle.trim();
    const trimName = name.trim();
    if (!trimHandle) { setFieldError('Username is required.'); return; }
    if (!trimName) { setFieldError('Display name is required.'); return; }
    if (password && password !== confirmPassword) { setFieldError('Passwords do not match.'); return; }

    setStage('creating');
    try {
      const result = await invitationsApi.accept(token!, trimHandle, trimName, password || undefined);
      setDoneHandle(result.handle);
      // Auto-login the new user
      await login(result.handle, password || undefined);
      setStage('done');
    } catch (e) {
      setFieldError(e instanceof Error ? e.message : 'Registration failed.');
      setStage('form');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">SillyTavern</h1>
        </div>

        {stage === 'validating' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">Validating invite link…</p>
          </div>
        )}

        {stage === 'invalid' && (
          <div className="bg-[var(--color-bg-secondary)] rounded-xl p-6 text-center space-y-4">
            <XCircle size={40} className="mx-auto text-red-400" />
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Invite Invalid</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{invalidReason}</p>
            <Button variant="ghost" onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </div>
        )}

        {(stage === 'form' || stage === 'creating') && (
          <div className="bg-[var(--color-bg-secondary)] rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Create Your Account</h2>
              {inviteLabel && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{inviteLabel}</p>
              )}
              {inviteRole && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Role: <span className="capitalize">{inviteRole.replace('_', ' ')}</span>
                </p>
              )}
            </div>

            <Input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="Username (e.g. alice)"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={stage === 'creating'}
            />
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Display name"
              disabled={stage === 'creating'}
            />
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password (optional)"
              disabled={stage === 'creating'}
            />
            {password && (
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                disabled={stage === 'creating'}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            )}

            {fieldError && (
              <p className="text-xs text-red-400">{fieldError}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={stage === 'creating'}
              className="w-full"
            >
              {stage === 'creating'
                ? <><Loader2 size={16} className="animate-spin mr-2" /> Creating account…</>
                : 'Create Account'}
            </Button>
          </div>
        )}

        {stage === 'done' && (
          <div className="bg-[var(--color-bg-secondary)] rounded-xl p-6 text-center space-y-4">
            <CheckCircle size={40} className="mx-auto text-green-400" />
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Welcome, @{doneHandle}!
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Your account has been created and you're logged in.
            </p>
            <Button onClick={() => navigate('/')} className="w-full">
              Get Started
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
