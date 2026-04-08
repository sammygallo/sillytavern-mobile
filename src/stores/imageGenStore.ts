import { create } from 'zustand';
import { imageGenApi, type ImageGenBackend } from '../api/imageGenApi';

const STORAGE_KEY = 'sillytavern_imagegen_config';

interface ImageGenConfig {
  backend: ImageGenBackend;
  sdUrl: string;
  sdAuth: string;
  pollinationsModel: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
}

const DEFAULT_CONFIG: ImageGenConfig = {
  backend: 'pollinations',
  sdUrl: 'http://localhost:7860',
  sdAuth: '',
  pollinationsModel: 'flux',
  width: 1024,
  height: 1024,
  steps: 20,
  cfgScale: 7,
};

function loadConfig(): ImageGenConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: ImageGenConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface ImageGenState extends ImageGenConfig {
  isGenerating: boolean;
  error: string | null;

  setConfig: (patch: Partial<ImageGenConfig>) => void;
  /** Generate an image and return its data URI, or null on failure. */
  generate: (prompt: string, negativePrompt?: string) => Promise<string | null>;
  clearError: () => void;
}

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  ...loadConfig(),
  isGenerating: false,
  error: null,

  setConfig: (patch) => {
    set((s) => {
      const next = { ...s, ...patch };
      const config: ImageGenConfig = {
        backend: next.backend,
        sdUrl: next.sdUrl,
        sdAuth: next.sdAuth,
        pollinationsModel: next.pollinationsModel,
        width: next.width,
        height: next.height,
        steps: next.steps,
        cfgScale: next.cfgScale,
      };
      saveConfig(config);
      return next;
    });
  },

  generate: async (prompt, negativePrompt) => {
    const { backend, sdUrl, sdAuth, pollinationsModel, width, height, steps, cfgScale } = get();
    set({ isGenerating: true, error: null });
    try {
      let result;
      if (backend === 'sdwebui') {
        result = await imageGenApi.generateSdWebui({
          url: sdUrl,
          auth: sdAuth || undefined,
          prompt,
          negativePrompt: negativePrompt || undefined,
          width,
          height,
          steps,
          cfgScale,
        });
      } else {
        result = await imageGenApi.generatePollinations({
          prompt,
          negativePrompt: negativePrompt || undefined,
          model: pollinationsModel,
          width,
          height,
        });
      }
      set({ isGenerating: false });
      return `data:image/${result.format};base64,${result.base64}`;
    } catch (e) {
      set({ isGenerating: false, error: e instanceof Error ? e.message : 'Generation failed' });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));
