import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Database, Eye, EyeOff, FileText, Globe, Image, Key, Languages, Loader2, MessageSquare, Mic, Palette, Plug, Replace, Sliders, Trash2, UserPlus, Users, Volume2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../stores/settingsStore';
import { PROVIDERS, type SecretState } from '../../api/client';
import { Button, Input } from '../ui';
import {
  SPEECH_LANGUAGES,
  getSpeechLanguage,
  setSpeechLanguage,
  getTtsVoiceUri,
  setTtsVoiceUri,
  getTtsRate,
  setTtsRate,
  getTtsPitch,
  setTtsPitch,
  getTtsAutoRead,
  setTtsAutoRead,
} from '../../hooks/speechLanguage';
import {
  getChatLayoutMode,
  setChatLayoutMode,
  getAvatarShape,
  setAvatarShape,
  getChatFontSize,
  setChatFontSize,
  getChatMaxWidth,
  setChatMaxWidth,
  getVnMode,
  setVnMode,
  type ChatLayoutMode,
  type AvatarShape,
} from '../../hooks/displayPreferences';
import {
  getThemeMode,
  setThemeMode,
  getThemePreset,
  setThemePreset,
  applyTheme,
  THEME_PRESETS,
  PRESET_SWATCHES,
  type ThemeMode,
  type ThemePreset,
} from '../../hooks/themePreferences';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { useTranslateStore } from '../../stores/translateStore';
import { TRANSLATE_PROVIDERS, TRANSLATE_LANGUAGES, type TranslateProvider } from '../../api/translateApi';
import { useConnectionProfileStore } from '../../stores/connectionProfileStore';
import { useGenerationStore } from '../../stores/generationStore';

/**
 * Phase 10.1 — Local model presets.
 * One-click buttons that pre-fill the custom endpoint URL (and, for Ollama
 * only, a default model name) for the five most common local OpenAI-compatible
 * servers. All five serve the OpenAI `/v1` base; users just need to know the
 * right host + port, which this table encodes.
 */
interface LocalPreset {
  name: string;
  url: string;
  defaultModel?: string;
}

const LOCAL_PRESETS: LocalPreset[] = [
  { name: 'Ollama', url: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1' },
  { name: 'llama.cpp', url: 'http://localhost:8080/v1' },
  { name: 'KoboldCpp', url: 'http://localhost:5001/v1' },
  { name: 'Oobabooga', url: 'http://localhost:5000/v1' },
];

/**
 * Phase 10.1 — Test a custom OpenAI-compatible endpoint from the browser.
 *
 * Fetches `${url}/models` directly (no backend proxy — local endpoints are
 * reachable from the browser since they're on localhost). On success returns
 * the list of model IDs so the UI can turn the model field into a dropdown.
 * On failure returns a human-readable error message with specific hints for
 * the most common misconfigurations (missing `/v1`, CORS, server not running).
 */
async function testLocalEndpoint(
  url: string
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const normalized = url.replace(/\/+$/, '');
  try {
    const res = await fetch(`${normalized}/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: false,
          error: "Endpoint returned 404. Did you include '/v1' at the end of the URL?",
        };
      }
      return { ok: false, error: `Endpoint returned HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => null)) as
      | { data?: Array<{ id?: string }> }
      | null;
    const models = Array.isArray(data?.data)
      ? data.data
          .map((m) => m.id)
          .filter((x): x is string => typeof x === 'string')
      : [];
    return { ok: true, models };
  } catch (e) {
    // Browser fetch throws TypeError for both network failures and CORS
    // blocks (the response is opaque, so we can't distinguish them). Point
    // the user at both possibilities in one message.
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error:
        `Couldn't reach the endpoint (${msg}). Is your local server running? ` +
        'CORS may also block browser access — see help below.',
    };
  }
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; count: number }
  | { kind: 'error'; message: string };

export function SettingsPage() {
  const navigate = useNavigate();
  const {
    secrets,
    activeProvider,
    activeModel,
    customUrl,
    isLoading,
    isSaving,
    error,
    successMessage,
    fetchSecrets,
    fetchSettings,
    saveApiKey,
    deleteApiKey,
    setActiveProvider,
    setActiveModel,
    setCustomUrl,
    clearMessages,
  } = useSettingsStore();

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Phase 8.4: Connection profiles
  const { profiles, activeProfileId, saveProfile, deleteProfile, renameProfile, setActiveProfileId } = useConnectionProfileStore();
  const generationSampler = useGenerationStore((s) => s.sampler);
  const loadGenerationPreset = useGenerationStore((s) => s.setSampler);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [renamingProfileId, setRenamingProfileId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Custom endpoint fields — kept as local state and only persisted on Save/blur.
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  // Phase 10.1: test-connection state and model-list discovery.
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [speechLang, setSpeechLangState] = useState<string>(() => getSpeechLanguage());
  const { isSupported: isSpeechSupported } = useSpeechRecognition();

  // Phase 7.4: Theme preferences
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [themePresetVal, setThemePresetState] = useState<ThemePreset>(() => getThemePreset());

  // Phase 7.3: Chat display preferences
  const [layoutMode, setLayoutModeState] = useState<ChatLayoutMode>(() => getChatLayoutMode());
  const [avatarShapePref, setAvatarShapeState] = useState<AvatarShape>(() => getAvatarShape());
  const [fontSizePref, setFontSizeState] = useState<number>(() => getChatFontSize());
  const [chatWidthPref, setChatWidthState] = useState<number>(() => getChatMaxWidth());
  // Phase 6.4: VN mode
  const [vnModeOn, setVnModeState] = useState<boolean>(() => getVnMode());

  // Phase 6.3: TTS settings state
  const { isSupported: isTtsSupported, voices: ttsVoices } = useSpeechSynthesis();
  const [ttsVoiceUri, setTtsVoiceUriState] = useState<string>(() => getTtsVoiceUri());
  const [ttsRate, setTtsRateState] = useState<number>(() => getTtsRate());
  const [ttsPitch, setTtsPitchState] = useState<number>(() => getTtsPitch());
  const [ttsAutoReadOn, setTtsAutoReadState] = useState<boolean>(() => getTtsAutoRead());

  // Phase 7.2: Translation settings
  const translateProvider = useTranslateStore((s) => s.provider);
  const translateLang = useTranslateStore((s) => s.targetLang);
  const setTranslateProvider = useTranslateStore((s) => s.setProvider);
  const setTranslateLang = useTranslateStore((s) => s.setTargetLang);

  useEffect(() => {
    fetchSecrets();
    fetchSettings();
  }, [fetchSecrets, fetchSettings]);

  useEffect(() => {
    if (successMessage || error) {
      const timer = setTimeout(clearMessages, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, error, clearMessages]);

  // Sync local custom-endpoint inputs from store after fetchSettings resolves.
  useEffect(() => { setCustomUrlInput(customUrl); }, [customUrl]);
  useEffect(() => { setCustomModelInput(activeModel); }, [activeModel]);

  // Phase 10.1: reset test-connection state whenever the URL input changes so
  // a stale "success" badge doesn't linger after the user edits the URL.
  useEffect(() => {
    setTestState({ kind: 'idle' });
    setDiscoveredModels([]);
  }, [customUrlInput]);

  const handleSaveApiKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId];
    if (!key?.trim()) return;

    await saveApiKey(providerId, key.trim());
    setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
  };

  const hasApiKey = (secretKey: string): boolean => {
    const secretData = secrets[secretKey];
    if (Array.isArray(secretData)) {
      return secretData.length > 0;
    }
    return false;
  };

  const getSecretInfo = (secretKey: string): SecretState | null => {
    const secretData = secrets[secretKey];
    if (Array.isArray(secretData) && secretData.length > 0) {
      return secretData.find((s) => s.active) || secretData[0];
    }
    return null;
  };

  const currentProvider = PROVIDERS.find((p) => p.id === activeProvider);

  // Custom provider is "configured" when a URL is set, not by API key.
  const isProviderConfigured = (provider: typeof PROVIDERS[number]) =>
    provider.id === 'custom' ? !!customUrl : hasApiKey(provider.secretKey);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="h-14 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center px-4 gap-3 safe-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="p-2"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          AI Settings
        </h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Status Messages */}
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

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <>
            {/* Active Provider Selection */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                Active Provider
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS.map((provider) => {
                  const configured = isProviderConfigured(provider);
                  const isActive = activeProvider === provider.id;

                  return (
                    <button
                      key={provider.id}
                      onClick={() => setActiveProvider(provider.id)}
                      disabled={isSaving}
                      className={`
                        relative p-3 rounded-lg text-left transition-all
                        ${isActive
                          ? 'bg-[var(--color-primary)] text-white'
                          : configured
                            ? 'bg-[var(--color-bg-tertiary)] hover:bg-zinc-700'
                            : 'bg-[var(--color-bg-tertiary)] opacity-50'
                        }
                      `}
                    >
                      <span className="text-sm font-medium">{provider.name}</span>
                      {configured && (
                        <Check
                          size={14}
                          className={`absolute top-2 right-2 ${isActive ? 'text-white' : 'text-green-400'}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {activeProvider !== 'custom' && !hasApiKey(currentProvider?.secretKey || '') && (
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Configure an API key below to use this provider
                </p>
              )}
              {activeProvider === 'custom' && !customUrl && (
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Enter the endpoint URL below to use a local or custom model server
                </p>
              )}
            </section>

            {/* Custom Endpoint Configuration */}
            {activeProvider === 'custom' && (
              <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-[var(--color-text-secondary)]" />
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Custom Endpoint
                  </h2>
                </div>

                {/* Phase 10.1: one-click presets for the common local runners. */}
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">
                    Quick presets
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {LOCAL_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setCustomUrlInput(preset.url);
                          // Only pre-fill the model if a default exists AND the
                          // current model field is empty — don't clobber a user
                          // who already picked their own model name.
                          if (preset.defaultModel && !customModelInput.trim()) {
                            setCustomModelInput(preset.defaultModel);
                          }
                        }}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                    Base URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      value={customUrlInput}
                      onChange={(e) => setCustomUrlInput(e.target.value)}
                      placeholder="http://localhost:11434/v1"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const url = customUrlInput.trim();
                        if (!url) return;
                        setTestState({ kind: 'pending' });
                        const result = await testLocalEndpoint(url);
                        if (result.ok) {
                          setTestState({ kind: 'success', count: result.models.length });
                          setDiscoveredModels(result.models);
                        } else {
                          setTestState({ kind: 'error', message: result.error });
                          setDiscoveredModels([]);
                        }
                      }}
                      disabled={testState.kind === 'pending' || !customUrlInput.trim()}
                      className="shrink-0"
                    >
                      {testState.kind === 'pending' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </Button>
                    <Button
                      onClick={() => setCustomUrl(customUrlInput.trim())}
                      disabled={isSaving || !customUrlInput.trim() || customUrlInput.trim() === customUrl}
                      className="shrink-0"
                    >
                      {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                    </Button>
                  </div>

                  {/* Phase 10.1: test-connection result badge */}
                  {testState.kind === 'success' && (
                    <p className="mt-1.5 text-xs text-green-400 flex items-center gap-1">
                      <Check size={12} />
                      Connected. Found {testState.count} model{testState.count !== 1 ? 's' : ''}.
                    </p>
                  )}
                  {testState.kind === 'error' && (
                    <p className="mt-1.5 text-xs text-red-400">{testState.message}</p>
                  )}

                  <div className="mt-2 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    <p className="mb-1">OpenAI-compatible base URL. Ends in <code>/v1</code> for most tools.</p>
                    <p className="mb-1">
                      <strong className="text-[var(--color-text-primary)]">CORS:</strong> your local server must allow browser requests.
                      Ollama and LM Studio allow it by default;
                      for <code>llama.cpp</code> run with <code>--cors</code>;
                      KoboldCpp enables it by default on recent versions.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                    Model name
                  </label>
                  {discoveredModels.length > 0 ? (
                    <>
                      <select
                        value={
                          discoveredModels.includes(customModelInput)
                            ? customModelInput
                            : '__custom__'
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__custom__') {
                            // Clear the discovered list so the text input returns
                            setDiscoveredModels([]);
                            return;
                          }
                          setCustomModelInput(value);
                          if (value !== activeModel) {
                            setActiveModel(value);
                          }
                        }}
                        className="w-full text-sm bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        {discoveredModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        <option value="__custom__">Custom…</option>
                      </select>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        Discovered from <code>{customUrlInput}/models</code>. Select one or choose Custom… to type manually.
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        onBlur={() => {
                          if (customModelInput !== activeModel) {
                            setActiveModel(customModelInput);
                          }
                        }}
                        placeholder="e.g. llama3, mistral, codellama"
                      />
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        Exact model identifier your endpoint expects. Click Test to discover available models.
                      </p>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Model Selection */}
            {currentProvider && activeProvider !== 'custom' && (
              <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                  Model
                </h2>
                <select
                  value={activeModel}
                  onChange={(e) => setActiveModel(e.target.value)}
                  disabled={isSaving}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {currentProvider.models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </section>
            )}

            {/* Phase 8.4: Connection Profiles */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <div className="flex items-center gap-2 mb-3">
                <Plug size={16} className="text-[var(--color-text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Connection Profiles
                </h2>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                Save the current provider, model, and sampler settings as a named profile to switch between quickly.
              </p>

              {/* Saved profiles list */}
              {profiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                        activeProfileId === profile.id
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      {renamingProfileId === profile.id ? (
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { renameProfile(profile.id, renameInput); setRenamingProfileId(null); }
                            else if (e.key === 'Escape') setRenamingProfileId(null);
                          }}
                          onBlur={() => { renameProfile(profile.id, renameInput); setRenamingProfileId(null); }}
                          className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] border-b border-[var(--color-primary)] focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => {
                            const p = profile;
                            setActiveProfileId(p.id);
                            // Apply provider + model
                            setActiveProvider(p.provider);
                            setActiveModel(p.model);
                            if (p.provider === 'custom' && p.customUrl) setCustomUrl(p.customUrl);
                            // Apply sampler
                            loadGenerationPreset(p.sampler);
                          }}
                        >
                          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">
                            {profile.name}
                          </span>
                          <span className="text-[10px] text-[var(--color-text-secondary)]">
                            {profile.provider} · {profile.model || 'custom'}
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => { setRenamingProfileId(profile.id); setRenameInput(profile.name); }}
                        className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0"
                        title="Rename"
                        aria-label="Rename profile"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={() => { deleteProfile(profile.id); if (activeProfileId === profile.id) setActiveProfileId(null); }}
                        className="p-1 text-[var(--color-text-secondary)] hover:text-red-400 transition-colors flex-shrink-0"
                        title="Delete profile"
                        aria-label="Delete profile"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save current config as new profile */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && profileNameInput.trim()) {
                      saveProfile(profileNameInput, activeProvider, activeModel, customUrl, generationSampler);
                      setProfileNameInput('');
                    }
                  }}
                  placeholder="Profile name…"
                  className="flex-1 min-w-0 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <button
                  onClick={() => {
                    if (!profileNameInput.trim()) return;
                    saveProfile(profileNameInput, activeProvider, activeModel, customUrl, generationSampler);
                    setProfileNameInput('');
                  }}
                  disabled={!profileNameInput.trim()}
                  className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Save
                </button>
              </div>
            </section>

            {/* API Keys Configuration */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                API Keys
              </h2>
              <div className="space-y-4">
                {PROVIDERS.filter((p) => p.id !== 'custom').map((provider) => {
                  const secretInfo = getSecretInfo(provider.secretKey);
                  const configured = !!secretInfo;
                  const inputValue = apiKeyInputs[provider.id] || '';
                  const showKey = showApiKey[provider.id] || false;

                  return (
                    <div
                      key={provider.id}
                      className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Key size={16} className="text-[var(--color-text-secondary)]" />
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">
                            {provider.name}
                          </span>
                        </div>
                        {configured && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-400">Configured</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteApiKey(provider.secretKey)}
                              disabled={isSaving}
                              className="p-1 text-red-400 hover:text-red-300"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type={showKey ? 'text' : 'password'}
                            value={inputValue}
                            onChange={(e) =>
                              setApiKeyInputs((prev) => ({
                                ...prev,
                                [provider.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              configured
                                ? 'Enter new key to replace...'
                                : 'Enter API key...'
                            }
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowApiKey((prev) => ({
                                ...prev,
                                [provider.id]: !prev[provider.id],
                              }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                          >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <Button
                          onClick={() => handleSaveApiKey(provider.id)}
                          disabled={!inputValue.trim() || isSaving}
                          className="shrink-0"
                        >
                          {isSaving ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            'Save'
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Generation Settings Link */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/generation')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Sliders size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Generation Settings
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Samplers, prompts, context, and instruct mode
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Prompt Templates Link */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/prompts')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <FileText size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Prompt Templates
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Save and share full prompt setups
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* World Info Link */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/worldinfo')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <BookOpen size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    World Info
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Lorebooks with keyword-triggered context injection
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Regex Scripts Link (Phase 8.2) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/regex')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Replace size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Regex Scripts
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Find/replace patterns for message processing
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Invitations */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/invitations')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <UserPlus size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Invitations
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Create invite links for new users
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Users (Phase 3.1) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/users')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Users size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Users
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Manage accounts, roles, and access
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Quick Replies (Phase 10.2) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/quickreplies')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Zap size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Quick Replies</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Saved prompt shortcuts
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Extensions (Phase 7.1) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/extensions')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <MessageSquare size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Extensions</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    TTS, image gen, translation, summarization
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Image Gallery (Phase 7.3) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/gallery')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Image size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Image Gallery</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Browse previously generated images
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Data Bank (Phase 8.5) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden cyberpunk-card">
              <button
                onClick={() => navigate('/settings/databank')}
                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                  <Database size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Data Bank</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    RAG — upload documents and inject relevant chunks into context
                  </p>
                </div>
                <ChevronRight size={20} className="text-[var(--color-text-secondary)]" />
              </button>
            </section>

            {/* Appearance (Phase 7.4) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <div className="flex items-center gap-2 mb-3">
                <Palette size={16} className="text-[var(--color-text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Appearance
                </h2>
              </div>

              {/* Theme Mode */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { value: 'light' as const, label: 'Light' },
                  { value: 'dark' as const, label: 'Dark' },
                  { value: 'auto' as const, label: 'Auto' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setThemeModeState(opt.value);
                      setThemeMode(opt.value);
                      applyTheme();
                    }}
                    className={`p-2.5 rounded-lg text-center text-xs font-medium transition-all ${
                      themeMode === opt.value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Accent Color */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">
                Accent Color
              </label>
              <div className="flex gap-3">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setThemePresetState(preset);
                      setThemePreset(preset);
                      applyTheme();
                    }}
                    className={`w-8 h-8 rounded-full transition-all ${
                      themePresetVal === preset
                        ? 'ring-2 ring-offset-2 ring-offset-[var(--color-bg-secondary)] ring-[var(--color-primary)] scale-110'
                        : 'hover:scale-110'
                    }`}
                    style={{
                      ...(PRESET_SWATCHES[preset].includes('gradient')
                        ? { background: PRESET_SWATCHES[preset] }
                        : { backgroundColor: PRESET_SWATCHES[preset] }),
                    }}
                    title={preset.charAt(0).toUpperCase() + preset.slice(1)}
                    aria-label={`${preset} theme`}
                  />
                ))}
              </div>
            </section>

            {/* Chat Display (Phase 7.3) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={16} className="text-[var(--color-text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Chat Display
                </h2>
              </div>

              {/* Layout Mode */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">
                Layout
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { value: 'bubbles' as const, label: 'Bubbles', desc: 'Rounded colored bubbles' },
                  { value: 'flat' as const, label: 'Flat', desc: 'Full-width, dividers' },
                  { value: 'document' as const, label: 'Document', desc: 'Compact, inline names' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setLayoutModeState(opt.value); setChatLayoutMode(opt.value); }}
                    className={`p-2.5 rounded-lg text-center transition-all ${
                      layoutMode === opt.value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-zinc-700'
                    }`}
                  >
                    <span className="text-xs font-medium block">{opt.label}</span>
                    <span className={`text-[10px] block mt-0.5 ${
                      layoutMode === opt.value ? 'text-white/70' : 'text-[var(--color-text-secondary)]'
                    }`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Avatar Shape */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">
                Avatar Shape
              </label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { value: 'circle' as const, label: 'Circle', cls: 'rounded-full' },
                  { value: 'square' as const, label: 'Square', cls: 'rounded-none' },
                  { value: 'rounded-square' as const, label: 'Rounded', cls: 'rounded-md' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setAvatarShapeState(opt.value); setAvatarShape(opt.value); }}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg transition-all ${
                      avatarShapePref === opt.value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-zinc-700'
                    }`}
                  >
                    <span className={`w-4 h-4 ${opt.cls} ${
                      avatarShapePref === opt.value ? 'bg-white/80' : 'bg-[var(--color-text-secondary)]'
                    }`} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Font Size */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                Font Size: {fontSizePref}px
              </label>
              <input
                type="range"
                min={12}
                max={20}
                step={1}
                value={fontSizePref}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFontSizeState(v);
                  setChatFontSize(v);
                }}
                className="w-full accent-[var(--color-primary)] mb-1"
              />
              <p className="text-[var(--color-text-secondary)] mb-4" style={{ fontSize: `${fontSizePref}px` }}>
                Sample text Aa
              </p>

              {/* Chat Width */}
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                Message Width: {chatWidthPref}%
                {layoutMode !== 'bubbles' && (
                  <span className="ml-1 text-[var(--color-text-secondary)]">(bubbles only)</span>
                )}
              </label>
              <input
                type="range"
                min={60}
                max={100}
                step={5}
                value={chatWidthPref}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setChatWidthState(v);
                  setChatMaxWidth(v);
                }}
                className="w-full accent-[var(--color-primary)]"
              />

              {/* Visual Novel Mode */}
              <div className="flex items-center justify-between mt-4">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">Visual Novel Mode</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                    Full-screen sprite behind chat with semi-transparent message overlay
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={vnModeOn}
                  onClick={() => {
                    const next = !vnModeOn;
                    setVnModeState(next);
                    setVnMode(next);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    vnModeOn ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      vnModeOn ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* Voice Input Language */}
            {isSpeechSupported && (
              <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
                <div className="flex items-center gap-2 mb-2">
                  <Mic size={16} className="text-[var(--color-text-secondary)]" />
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Voice Input Language
                  </h2>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                  Language used for speech-to-text dictation in the chat input.
                </p>
                <select
                  value={speechLang}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSpeechLangState(next);
                    setSpeechLanguage(next);
                  }}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {SPEECH_LANGUAGES.some((l) => l.code === speechLang) ? null : (
                    <option value={speechLang}>{speechLang} (current)</option>
                  )}
                  {SPEECH_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label} ({lang.code})
                    </option>
                  ))}
                </select>
              </section>
            )}

            {/* Text-to-Speech (Phase 6.3) */}
            {isTtsSupported && (
              <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 size={16} className="text-[var(--color-text-secondary)]" />
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Text-to-Speech
                  </h2>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                  Voice used when reading AI messages aloud.
                </p>

                {/* Voice picker */}
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  Voice
                </label>
                <select
                  value={ttsVoiceUri}
                  onChange={(e) => {
                    const uri = e.target.value;
                    setTtsVoiceUriState(uri);
                    setTtsVoiceUri(uri);
                  }}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-4"
                >
                  <option value="">System default</option>
                  {ttsVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>

                {/* Rate slider */}
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  Rate: {ttsRate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={ttsRate}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setTtsRateState(val);
                    setTtsRate(val);
                  }}
                  className="w-full mb-4 accent-[var(--color-primary)]"
                />

                {/* Pitch slider */}
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  Pitch: {ttsPitch.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={ttsPitch}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setTtsPitchState(val);
                    setTtsPitch(val);
                  }}
                  className="w-full mb-4 accent-[var(--color-primary)]"
                />

                {/* Auto-read toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">Auto-read new messages</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Automatically read each new AI message aloud
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ttsAutoReadOn}
                    onClick={() => {
                      const next = !ttsAutoReadOn;
                      setTtsAutoReadState(next);
                      setTtsAutoRead(next);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                      ttsAutoReadOn ? 'bg-[var(--color-primary)]' : 'bg-zinc-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        ttsAutoReadOn ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </section>
            )}

            {/* Translation (Phase 7.2) */}
            <section className="bg-[var(--color-bg-secondary)] rounded-lg p-4 cyberpunk-card">
              <div className="flex items-center gap-2 mb-3">
                <Languages size={16} className="text-[var(--color-text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Translation
                </h2>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                Per-message translate button on AI messages. Google and Bing work without extra config.
              </p>

              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                Provider
              </label>
              <select
                value={translateProvider}
                onChange={(e) => setTranslateProvider(e.target.value as TranslateProvider)}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-4"
              >
                {TRANSLATE_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.free ? '' : ' (requires config)'}
                  </option>
                ))}
              </select>

              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                Target Language
              </label>
              <select
                value={translateLang}
                onChange={(e) => setTranslateLang(e.target.value)}
                className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </section>

            {/* Help Text */}
            <section className="text-center py-4">
              <p className="text-xs text-[var(--color-text-secondary)]">
                API keys are stored securely on the server and never exposed to the frontend.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
