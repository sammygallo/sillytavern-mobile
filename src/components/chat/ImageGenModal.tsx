import { useState, useRef, useEffect } from 'react';
import { X, Image, Settings2, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useImageGenStore } from '../../stores/imageGenStore';
import { imageGenApi } from '../../api/imageGenApi';
import { Button } from '../ui';
import type { ImageGenBackend } from '../../api/imageGenApi';

interface ImageGenModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the generated image data URL once the user confirms insertion. */
  onInsert: (dataUrl: string, prompt: string) => void;
  /** Optional prompt pre-fill (e.g. character name). */
  initialPrompt?: string;
  /** Current chat messages — used for context-aware prompt generation. */
  messages?: { name: string; isUser: boolean; isSystem: boolean; content: string }[];
  /** Character name for context-aware prompt generation. */
  characterName?: string;
}

const POLLINATIONS_MODELS = [
  'flux',
  'flux-realism',
  'flux-cablyai',
  'flux-anime',
  'flux-3d',
  'turbo',
];

const SIZE_PRESETS = [
  { label: 'Square 1024\u00d71024', width: 1024, height: 1024 },
  { label: 'Portrait 768\u00d71024', width: 768, height: 1024 },
  { label: 'Landscape 1024\u00d7768', width: 1024, height: 768 },
  { label: 'SD Square 512\u00d7512', width: 512, height: 512 },
  { label: 'SD Portrait 512\u00d7768', width: 512, height: 768 },
  { label: 'SD Landscape 768\u00d7512', width: 768, height: 512 },
];

const DALLE3_SIZE_PRESETS = [
  { label: 'Square 1024\u00d71024', width: 1024, height: 1024 },
  { label: 'Landscape 1792\u00d71024', width: 1792, height: 1024 },
  { label: 'Portrait 1024\u00d71792', width: 1024, height: 1792 },
];

const DALLE2_SIZE_PRESETS = [
  { label: 'Small 256\u00d7256', width: 256, height: 256 },
  { label: 'Medium 512\u00d7512', width: 512, height: 512 },
  { label: 'Large 1024\u00d71024', width: 1024, height: 1024 },
];

export function ImageGenModal({
  isOpen,
  onClose,
  onInsert,
  initialPrompt = '',
  messages,
  characterName,
}: ImageGenModalProps) {
  const {
    backend,
    sdUrl,
    sdAuth,
    pollinationsModel,
    dalleModel,
    dalleQuality,
    width,
    height,
    steps,
    cfgScale,
    isGenerating,
    error,
    setConfig,
    generate,
    clearError,
  } = useImageGenStore();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNeg, setShowNeg] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt);
      setResult(null);
      clearError();
      const t = setTimeout(() => promptRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setResult(null);
    const dataUrl = await generate(prompt.trim(), negativePrompt.trim() || undefined);
    if (dataUrl) setResult(dataUrl);
  };

  const handleInsert = () => {
    if (!result) return;
    onInsert(result, prompt.trim());
    setResult(null);
    onClose();
  };

  const handleGeneratePrompt = async () => {
    if (!messages || messages.length === 0 || isGeneratingPrompt) return;
    setIsGeneratingPrompt(true);
    try {
      const generatedPrompt = await imageGenApi.generatePromptFromContext(
        messages,
        characterName || 'Character'
      );
      if (generatedPrompt) {
        setPrompt(generatedPrompt);
      }
    } catch (err) {
      console.error('Failed to generate prompt from context:', err);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !result) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Choose size presets based on backend
  const activeSizePresets =
    backend === 'dalle'
      ? dalleModel === 'dall-e-3'
        ? DALLE3_SIZE_PRESETS
        : DALLE2_SIZE_PRESETS
      : SIZE_PRESETS;

  const sizeKey = `${width}x${height}`;

  const hasContext = messages && messages.some((m) => !m.isSystem);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onKeyDown={handleModalKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-[var(--color-bg-secondary)] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <Image size={18} className="text-[var(--color-primary)]" />
          <h2 className="flex-1 text-base font-semibold text-[var(--color-text-primary)]">
            Generate Image
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Prompt <span className="text-zinc-500 font-normal">(Ctrl+Enter to generate)</span>
              </label>
              {hasContext && (
                <button
                  type="button"
                  onClick={handleGeneratePrompt}
                  disabled={isGeneratingPrompt || isGenerating}
                  className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 transition-colors disabled:opacity-50"
                  title="Generate prompt from chat context"
                >
                  {isGeneratingPrompt ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  From chat
                </button>
              )}
            </div>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
            />
          </div>

          {/* Negative prompt toggle */}
          {backend !== 'dalle' && (
            <>
              <button
                type="button"
                onClick={() => setShowNeg((v) => !v)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                {showNeg ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Negative prompt
              </button>
              {showNeg && (
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Things to exclude from the image..."
                  rows={2}
                  className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                />
              )}
            </>
          )}

          {/* Settings toggle */}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <Settings2 size={13} />
            {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Settings
          </button>

          {showSettings && (
            <div className="space-y-3 p-3 bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border)]">

              {/* Backend */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Backend
                </label>
                <select
                  value={backend}
                  onChange={(e) => setConfig({ backend: e.target.value as ImageGenBackend })}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                >
                  <option value="pollinations">Pollinations (free, no setup)</option>
                  <option value="sdwebui">SD WebUI (local)</option>
                  <option value="dalle">OpenAI DALL-E (requires API key)</option>
                </select>
              </div>

              {/* Pollinations model */}
              {backend === 'pollinations' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Model
                  </label>
                  <select
                    value={pollinationsModel}
                    onChange={(e) => setConfig({ pollinationsModel: e.target.value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                  >
                    {POLLINATIONS_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* DALL-E settings */}
              {backend === 'dalle' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Model
                    </label>
                    <select
                      value={dalleModel}
                      onChange={(e) => setConfig({ dalleModel: e.target.value as 'dall-e-3' | 'dall-e-2' })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                    >
                      <option value="dall-e-3">DALL-E 3 (highest quality)</option>
                      <option value="dall-e-2">DALL-E 2 (faster, cheaper)</option>
                    </select>
                  </div>
                  {dalleModel === 'dall-e-3' && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                        Quality
                      </label>
                      <select
                        value={dalleQuality}
                        onChange={(e) => setConfig({ dalleQuality: e.target.value as 'standard' | 'hd' })}
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                      >
                        <option value="standard">Standard</option>
                        <option value="hd">HD (higher detail, slower)</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* SD WebUI fields */}
              {backend === 'sdwebui' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      SD WebUI URL
                    </label>
                    <input
                      type="text"
                      value={sdUrl}
                      onChange={(e) => setConfig({ sdUrl: e.target.value })}
                      placeholder="http://localhost:7860"
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Auth <span className="font-normal text-zinc-500">(optional, user:pass)</span>
                    </label>
                    <input
                      type="text"
                      value={sdAuth}
                      onChange={(e) => setConfig({ sdAuth: e.target.value })}
                      placeholder="username:password"
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                        Steps
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={150}
                        value={steps}
                        onChange={(e) =>
                          setConfig({ steps: Math.max(1, Math.min(150, parseInt(e.target.value) || 20)) })
                        }
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                        CFG Scale
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        step={0.5}
                        value={cfgScale}
                        onChange={(e) =>
                          setConfig({ cfgScale: Math.max(1, Math.min(30, parseFloat(e.target.value) || 7)) })
                        }
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Size */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Size
                </label>
                <select
                  value={sizeKey}
                  onChange={(e) => {
                    const preset = activeSizePresets.find((p) => `${p.width}x${p.height}` === e.target.value);
                    if (preset) setConfig({ width: preset.width, height: preset.height });
                  }}
                  className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                >
                  {activeSizePresets.map((p) => {
                    const key = `${p.width}x${p.height}`;
                    return (
                      <option key={key} value={key}>
                        {p.label}
                      </option>
                    );
                  })}
                  {!activeSizePresets.find((p) => p.width === width && p.height === height) && (
                    <option value={sizeKey}>Custom {width}\u00d7{height}</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Result preview */}
          {result && (
            <div className="rounded-xl overflow-hidden border border-[var(--color-border)]">
              <img
                src={result}
                alt="Generated"
                className="w-full h-auto block max-h-80 object-contain bg-[var(--color-bg-tertiary)]"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex gap-2 flex-shrink-0">
          {result ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={() => { setResult(null); clearError(); handleGenerate(); }}
                disabled={isGenerating}
              >
                <RefreshCw size={15} />
                Retry
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={handleInsert}
              >
                Insert into chat
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="flex-1 flex items-center justify-center gap-2"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Image size={15} />
                  Generate
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
