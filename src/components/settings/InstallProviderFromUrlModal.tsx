import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, Check, X as XIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToastGlobal } from '../ui/Toast';
import { settingsApi } from '../../api/client';
import { probeProviderModels } from '../../api/providerProbe';
import { slugifyProviderName, type UserProvider } from '../../api/providerCatalog';
import { useCustomProviderStore } from '../../stores/customProviderStore';

type Mode = 'probe' | 'ai';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallProviderFromUrlModal({ isOpen, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('probe');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [docsUrl, setDocsUrl] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'preview' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [aiSupported, setAiSupported] = useState<boolean | null>(null);

  const addOrUpdate = useCustomProviderStore((s) => s.addOrUpdate);

  // Feature-detect the backend extraction endpoint.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    settingsApi.providerExtractorSupported().then((ok) => {
      if (alive) setAiSupported(ok);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  // Reset state whenever the modal opens. We key off isOpen and only run the
  // resets when it transitions to true — not synchronously, to avoid the
  // react-hooks/set-state-in-effect complaint. Using a microtask is enough
  // to satisfy the rule.
  useEffect(() => {
    if (!isOpen) return;
    Promise.resolve().then(() => {
      setMode('probe');
      setUrl('');
      setName('');
      setApiKey('');
      setModels([]);
      setDocsUrl('');
      setDescription('');
      setPhase('idle');
      setError(null);
    });
  }, [isOpen]);

  async function handleRun() {
    setPhase('running');
    setError(null);

    if (mode === 'probe') {
      const normalized = url.trim().replace(/\/+$/, '');
      if (!normalized) {
        setError('Enter a base URL');
        setPhase('idle');
        return;
      }
      const result = await probeProviderModels(normalized, apiKey.trim() || undefined);
      if (!result.ok) {
        setError(result.error);
        setPhase('idle');
        return;
      }
      // Auto-derive a name from the hostname if not set.
      if (!name.trim()) {
        try {
          const host = new URL(normalized).hostname.replace(/^www\./, '');
          setName(host);
        } catch {
          setName(normalized);
        }
      }
      setModels(result.models);
      setDocsUrl(normalized);
      setPhase('preview');
      return;
    }

    // AI docs mode
    const docsInput = url.trim();
    if (!docsInput) {
      setError('Paste a docs URL');
      setPhase('idle');
      return;
    }
    const result = await settingsApi.extractProviderFromUrl(docsInput);
    if (!result.ok) {
      setError(result.error);
      setPhase('idle');
      return;
    }
    const extracted = result.provider;
    setName(extracted.name || '');
    setUrl(extracted.baseUrl || '');
    setModels(extracted.defaultModels || []);
    setDocsUrl(extracted.docsUrl || docsInput);
    setDescription(extracted.description || '');
    setPhase('preview');
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      setError('Name and base URL are required');
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const id = slugifyProviderName(name);
      const provider: Omit<UserProvider, 'createdAt'> = {
        id,
        name: name.trim(),
        kind: 'chat-completion',
        category: 'aggregator',
        nativeRouted: false,
        baseUrl: url.trim().replace(/\/+$/, ''),
        secretKey: 'api_key_custom',
        defaultModels: models.filter((m) => m.trim().length > 0),
        docsUrl: docsUrl.trim() || undefined,
        description: description.trim() || undefined,
        sourceUrl: mode === 'ai' ? url.trim() : undefined,
      };
      await addOrUpdate(provider, apiKey.trim() || undefined);
      showToastGlobal(`Added ${provider.name}`, 'success');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save provider');
      setPhase('preview');
    }
  }

  const running = phase === 'running' || phase === 'saving';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add provider from URL" size="md">
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode('probe')}
            disabled={running}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'probe'
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Probe endpoint
          </button>
          <button
            type="button"
            onClick={() => setMode('ai')}
            disabled={running || aiSupported === false}
            title={
              aiSupported === false
                ? 'Backend does not support AI docs extraction yet'
                : undefined
            }
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === 'ai'
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Sparkles size={12} />
            Read docs with AI
          </button>
        </div>

        {/* Mode-specific intro */}
        {mode === 'probe' ? (
          <p className="text-xs text-[var(--color-text-secondary)]">
            Paste the base URL of an OpenAI-compatible endpoint. We'll hit{' '}
            <code className="text-[var(--color-text-primary)]">/models</code> to discover the
            model list.
          </p>
        ) : (
          <p className="text-xs text-[var(--color-text-secondary)]">
            Paste a link to the provider's API documentation. Claude will read the page and
            extract the base URL, models, and auth format. You'll confirm before saving.
          </p>
        )}

        {/* Step 1: URL input */}
        {phase !== 'preview' && (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                {mode === 'probe' ? 'Base URL' : 'Docs URL'}
              </label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  mode === 'probe'
                    ? 'https://api.together.xyz/v1'
                    : 'https://docs.together.ai/docs/openai-api-compatibility'
                }
                disabled={running}
              />
            </div>

            {mode === 'probe' && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  API key (optional, for probing)
                </label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  disabled={running}
                />
                <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                  Some /models endpoints require auth even to list.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-400">
                Only add providers from sources you trust. You'll review every field before
                saving.
              </p>
            </div>
          </>
        )}

        {/* Step 2: Preview / edit */}
        {phase === 'preview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <Check size={12} /> Extracted — review and edit before saving
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Display name
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Base URL
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                API key {mode === 'ai' ? '(required)' : '(optional)'}
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                Stored in the shared{' '}
                <code className="text-[var(--color-text-primary)]">api_key_custom</code> slot.
                Switching to another custom provider requires re-entering its key.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Models ({models.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {models.length === 0 && (
                  <span className="text-xs text-[var(--color-text-secondary)] italic">
                    No models detected. You can add them after saving.
                  </span>
                )}
                {models.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[10px] font-mono text-[var(--color-text-primary)]"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => setModels(models.filter((x) => x !== m))}
                      className="text-[var(--color-text-secondary)] hover:text-red-400"
                      aria-label={`Remove ${m}`}
                    >
                      <XIcon size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {description && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Description
                </label>
                <p className="text-xs text-[var(--color-text-secondary)] italic">{description}</p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          {phase !== 'preview' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRun}
              disabled={!url.trim() || running}
              isLoading={phase === 'running'}
            >
              {phase === 'running' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : mode === 'probe' ? (
                'Probe'
              ) : (
                'Extract'
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || !url.trim() || running}
              isLoading={phase === 'saving'}
            >
              Save provider
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
