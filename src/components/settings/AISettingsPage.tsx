import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Globe, Key, Loader2, Plug, Trash2 } from 'lucide-react';
import { useSettingsPanelStore } from '../../stores/settingsPanelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionProfileStore } from '../../stores/connectionProfileStore';
import { useGenerationStore } from '../../stores/generationStore';
import { PROVIDERS, type SecretState } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { hasMinRole } from '../../utils/permissions';
import { Button, Input } from '../ui';

type TestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; count: number }
  | { kind: 'error'; message: string };

interface LocalPreset { name: string; url: string; defaultModel?: string }
const LOCAL_PRESETS: LocalPreset[] = [
  { name: 'Ollama', url: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1' },
  { name: 'KoboldCpp', url: 'http://localhost:5001/v1' },
  { name: 'llama.cpp', url: 'http://localhost:8080/v1' },
  { name: 'TabbyAPI', url: 'http://localhost:5000/v1' },
];

async function testLocalEndpoint(
  url: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const normalized = url.replace(/\/+$/, '');
  try {
    const res = await fetch(`${normalized}/models`, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: "Endpoint returned 404. Did you include '/v1' at the end of the URL?" };
      return { ok: false, error: `Endpoint returned HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
    const models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter((x): x is string => typeof x === 'string') : [];
    return { ok: true, models };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Couldn't reach the endpoint (${msg}). Is your local server running? CORS may also block browser access.` };
  }
}

export function AISettingsPage(_props?: { params?: Record<string, string> }) {
  const { goBack } = useSettingsPanelStore();
  const {
    secrets, globalSecrets, globalSharingEnabled, globalSharingSupported,
    activeProvider, activeModel, customUrl,
    isSaving, error, successMessage,
    fetchSecrets, fetchSettings, fetchGlobalSecrets,
    saveApiKey, deleteApiKey, saveGlobalApiKey, deleteGlobalApiKey,
    setActiveProvider, setActiveModel, setCustomUrl, setGlobalSharing, clearMessages,
  } = useSettingsStore();
  const userRole = useAuthStore((s) => s.currentUser?.role);
  const isOwner = hasMinRole(userRole, 'owner');

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [globalKeyInputs, setGlobalKeyInputs] = useState<Record<string, string>>({});
  const [showGlobalKey, setShowGlobalKey] = useState<Record<string, boolean>>({});

  // Connection profiles
  const { profiles, activeProfileId, saveProfile, deleteProfile, renameProfile, setActiveProfileId } = useConnectionProfileStore();
  const generationSampler = useGenerationStore((s) => s.sampler);
  const loadGenerationPreset = useGenerationStore((s) => s.setSampler);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Custom endpoint
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  useEffect(() => { fetchSecrets(); fetchSettings(); if (isOwner) fetchGlobalSecrets(); }, [fetchSecrets, fetchSettings, fetchGlobalSecrets, isOwner]);
  useEffect(() => {
    if (successMessage || error) {
      const timer = setTimeout(clearMessages, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, error, clearMessages]);
  useEffect(() => { setCustomUrlInput(customUrl); }, [customUrl]);
  useEffect(() => { setCustomModelInput(activeModel); }, [activeModel]);
  useEffect(() => { setTestState({ kind: 'idle' }); setDiscoveredModels([]); }, [customUrlInput]);

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId];
    if (!key?.trim()) return;
    await saveApiKey(providerId, key.trim());
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
  };

  const handleSaveGlobalKey = async (providerId: string) => {
    const key = globalKeyInputs[providerId];
    if (!key?.trim()) return;
    await saveGlobalApiKey(providerId, key.trim());
    setGlobalKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
  };

  const getGlobalSecretInfo = (secretKey: string): SecretState | null => {
    const data = globalSecrets[secretKey];
    if (Array.isArray(data) && data.length > 0) {
      return data.find((s) => s.active) || data[0];
    }
    return null;
  };

  const hasApiKey = (secretKey: string): boolean => {
    const secretData = secrets[secretKey];
    return Array.isArray(secretData) && secretData.length > 0;
  };

  const getSecretInfo = (secretKey: string): SecretState | null => {
    const secretData = secrets[secretKey];
    if (Array.isArray(secretData) && secretData.length > 0) {
      return secretData.find((s) => s.active) || secretData[0];
    }
    return null;
  };

  const currentProvider = PROVIDERS.find((p) => p.id === activeProvider);
  const isProviderConfigured = (provider: typeof PROVIDERS[number]) =>
    provider.id === 'custom' ? !!customUrl : hasApiKey(provider.secretKey);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button variant="ghost" size="sm" onClick={() => goBack()} className="p-2" aria-label="Back">
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">AI Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Status */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-400">{successMessage}</p>
          </div>
        )}

        {/* Active Provider */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Active Provider</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROVIDERS.map((provider) => {
              const configured = isProviderConfigured(provider);
              const isActive = activeProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  onClick={() => setActiveProvider(provider.id)}
                  disabled={isSaving}
                  className={`relative p-3 rounded-lg text-left transition-all ${
                    isActive ? 'bg-[var(--color-primary)] text-white'
                      : configured ? 'bg-[var(--color-bg-tertiary)] hover:bg-zinc-700'
                        : 'bg-[var(--color-bg-tertiary)] opacity-50'
                  }`}
                >
                  <span className="text-sm font-medium">{provider.name}</span>
                  {configured && (
                    <Check size={14} className={`absolute top-2 right-2 ${isActive ? 'text-white' : 'text-green-400'}`} />
                  )}
                </button>
              );
            })}
          </div>
          {activeProvider !== 'custom' && !hasApiKey(currentProvider?.secretKey || '') && (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Configure an API key below to use this provider</p>
          )}
          {activeProvider === 'custom' && !customUrl && (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Enter the endpoint URL below to use a local or custom model server</p>
          )}
        </section>

        {/* Custom Endpoint */}
        {activeProvider === 'custom' && (
          <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-[var(--color-text-secondary)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Custom Endpoint</h2>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Quick presets</label>
              <div className="flex flex-wrap gap-1.5">
                {LOCAL_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setCustomUrlInput(preset.url);
                      if (preset.defaultModel && !customModelInput.trim()) setCustomModelInput(preset.defaultModel);
                    }}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Base URL</label>
              <div className="flex gap-2">
                <Input type="url" value={customUrlInput} onChange={(e) => setCustomUrlInput(e.target.value)} placeholder="http://localhost:11434/v1" className="flex-1" />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const url = customUrlInput.trim();
                    if (!url) return;
                    setTestState({ kind: 'pending' });
                    const result = await testLocalEndpoint(url);
                    if (result.ok) { setTestState({ kind: 'success', count: result.models.length }); setDiscoveredModels(result.models); }
                    else { setTestState({ kind: 'error', message: result.error }); setDiscoveredModels([]); }
                  }}
                  disabled={testState.kind === 'pending' || !customUrlInput.trim()}
                  className="shrink-0"
                >
                  {testState.kind === 'pending' ? <Loader2 size={16} className="animate-spin" /> : 'Test'}
                </Button>
                <Button onClick={() => setCustomUrl(customUrlInput.trim())} disabled={isSaving || !customUrlInput.trim() || customUrlInput.trim() === customUrl} className="shrink-0">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                </Button>
              </div>
              {testState.kind === 'success' && (
                <p className="mt-1.5 text-xs text-green-400 flex items-center gap-1"><Check size={12} /> Connected. Found {testState.count} model{testState.count !== 1 ? 's' : ''}.</p>
              )}
              {testState.kind === 'error' && <p className="mt-1.5 text-xs text-red-400">{testState.message}</p>}
              <div className="mt-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                <p className="mb-1">OpenAI-compatible base URL. Ends in <code>/v1</code> for most tools.</p>
                <p><strong className="text-[var(--color-text-primary)]">CORS:</strong> your local server must allow browser requests.</p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Model name</label>
              {discoveredModels.length > 0 ? (
                <>
                  <select
                    value={discoveredModels.includes(customModelInput) ? customModelInput : '__custom__'}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '__custom__') { setDiscoveredModels([]); return; }
                      setCustomModelInput(value);
                      if (value !== activeModel) setActiveModel(value);
                    }}
                    className="w-full text-sm bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    {discoveredModels.map((m) => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom__">Custom...</option>
                  </select>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Discovered from <code>{customUrlInput}/models</code>.</p>
                </>
              ) : (
                <>
                  <Input value={customModelInput} onChange={(e) => setCustomModelInput(e.target.value)} onBlur={() => { if (customModelInput !== activeModel) setActiveModel(customModelInput); }} placeholder="e.g. llama3, mistral, codellama" />
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Click Test to discover available models.</p>
                </>
              )}
            </div>
          </section>
        )}

        {/* Model Selection (non-custom) */}
        {currentProvider && activeProvider !== 'custom' && (
          <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Model</h2>
            <select value={activeModel} onChange={(e) => setActiveModel(e.target.value)} disabled={isSaving}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
              {currentProvider.models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </section>
        )}

        {/* Connection Profiles */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
          <div className="flex items-center gap-2 mb-3">
            <Plug size={16} className="text-[var(--color-text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Connection Profiles</h2>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">Save the current provider, model, and sampler settings as a named profile.</p>
          {profiles.length > 0 && (
            <div className="space-y-2 mb-3">
              {profiles.map((profile) => (
                <div key={profile.id} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${activeProfileId === profile.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)]'}`}>
                  {renamingProfileId === profile.id ? (
                    <input type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renameProfile(profile.id, renameInput); setRenamingProfileId(null); } else if (e.key === 'Escape') setRenamingProfileId(null); }}
                      onBlur={() => { renameProfile(profile.id, renameInput); setRenamingProfileId(null); }}
                      className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] border-b border-[var(--color-primary)] focus:outline-none" autoFocus />
                  ) : (
                    <button className="flex-1 min-w-0 text-left" onClick={() => {
                      setActiveProfileId(profile.id); setActiveProvider(profile.provider); setActiveModel(profile.model);
                      if (profile.provider === 'custom' && profile.customUrl) setCustomUrl(profile.customUrl);
                      loadGenerationPreset(profile.sampler);
                    }}>
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">{profile.name}</span>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{profile.provider} · {profile.model || 'custom'}</span>
                    </button>
                  )}
                  <button onClick={() => { setRenamingProfileId(profile.id); setRenameInput(profile.name); }} className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]" title="Rename">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => { deleteProfile(profile.id); if (activeProfileId === profile.id) setActiveProfileId(null); }} className="p-1 text-[var(--color-text-secondary)] hover:text-red-400" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && profileNameInput.trim()) { saveProfile(profileNameInput, activeProvider, activeModel, customUrl, generationSampler); setProfileNameInput(''); } }}
              placeholder="Profile name..." className="flex-1 min-w-0 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            <button onClick={() => { if (!profileNameInput.trim()) return; saveProfile(profileNameInput, activeProvider, activeModel, customUrl, generationSampler); setProfileNameInput(''); }}
              disabled={!profileNameInput.trim()} className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors whitespace-nowrap">
              Save
            </button>
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">API Keys</h2>
          <div className="space-y-4">
            {PROVIDERS.filter((p) => p.id !== 'custom').map((provider) => {
              const secretInfo = getSecretInfo(provider.secretKey);
              const configured = !!secretInfo;
              const inputValue = apiKeyInputs[provider.id] || '';
              const showKey = showApiKey[provider.id] || false;
              return (
                <div key={provider.id} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Key size={16} className="text-[var(--color-text-secondary)]" />
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{provider.name}</span>
                    </div>
                    {configured && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-400">Configured</span>
                        <Button variant="ghost" size="sm" onClick={() => deleteApiKey(provider.secretKey)} disabled={isSaving} className="p-1 text-red-400 hover:text-red-300">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input type={showKey ? 'text' : 'password'} value={inputValue}
                        onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                        placeholder={configured ? 'Enter new key to replace...' : 'Enter API key...'} className="pr-10" />
                      <button type="button" onClick={() => setShowApiKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button onClick={() => handleSaveApiKey(provider.id)} disabled={!inputValue.trim() || isSaving} className="shrink-0">
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Global API Keys — Owner only */}
        {isOwner && globalSharingSupported && (
          <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-[var(--color-text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Global API Keys</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-secondary)]">Share with all users</span>
                <button
                  role="switch"
                  aria-checked={globalSharingEnabled}
                  onClick={() => setGlobalSharing(!globalSharingEnabled)}
                  disabled={isSaving}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    globalSharingEnabled ? 'bg-[var(--color-primary)]' : 'bg-zinc-600'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    globalSharingEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Keys set here are used as defaults for users who haven't entered their own. Your personal keys above always take priority.
            </p>
            <div className="space-y-4">
              {PROVIDERS.filter((p) => p.id !== 'custom').map((provider) => {
                const globalInfo = getGlobalSecretInfo(provider.secretKey);
                const configured = !!globalInfo;
                const inputValue = globalKeyInputs[provider.id] || '';
                const showKey = showGlobalKey[provider.id] || false;
                return (
                  <div key={provider.id} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Globe size={16} className="text-[var(--color-text-secondary)]" />
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{provider.name}</span>
                      </div>
                      {configured && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-400">Shared</span>
                          <Button variant="ghost" size="sm" onClick={() => deleteGlobalApiKey(provider.secretKey)} disabled={isSaving} className="p-1 text-red-400 hover:text-red-300">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input type={showKey ? 'text' : 'password'} value={inputValue}
                          onChange={(e) => setGlobalKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                          placeholder={configured ? 'Enter new key to replace...' : 'Enter global API key...'} className="pr-10" />
                        <button type="button" onClick={() => setShowGlobalKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <Button onClick={() => handleSaveGlobalKey(provider.id)} disabled={!inputValue.trim() || isSaving} className="shrink-0">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
