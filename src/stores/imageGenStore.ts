import { create } from 'zustand';
import { imageGenApi, type ImageGenBackend } from '../api/imageGenApi';

// ---------------------------------------------------------------------------
// Gallery entry — persisted alongside config
// ---------------------------------------------------------------------------

export interface GalleryEntry {
  id: string;
  dataUrl: string;
  prompt: string;
  backend: ImageGenBackend;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sillytavern_imagegen_config';
const GALLERY_KEY = 'sillytavern_imagegen_gallery';

interface ImageGenConfig {
  backend: ImageGenBackend;
  sdUrl: string;
  sdAuth: string;
  pollinationsModel: string;
  dalleModel: 'dall-e-3' | 'dall-e-2';
  dalleQuality: 'standard' | 'hd';
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
  dalleModel: 'dall-e-3',
  dalleQuality: 'standard',
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

function loadGallery(): GalleryEntry[] {
  try {
    const stored = localStorage.getItem(GALLERY_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveGallery(gallery: GalleryEntry[]) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
}

// ---------------------------------------------------------------------------
// DALL-E size helpers
// ---------------------------------------------------------------------------

const DALLE3_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
const DALLE2_SIZES = ['256x256', '512x512', '1024x1024'] as const;

/** Map arbitrary w/h to the nearest valid DALL-E size string. */
function nearestDalleSize(
  w: number,
  h: number,
  model: 'dall-e-3' | 'dall-e-2'
): string {
  const sizes = model === 'dall-e-3' ? DALLE3_SIZES : DALLE2_SIZES;
  const aspect = w / h;
  let best = sizes[0];
  let bestDiff = Infinity;
  for (const s of sizes) {
    const [sw, sh] = s.split('x').map(Number);
    const diff = Math.abs(sw / sh - aspect);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ImageGenState extends ImageGenConfig {
  isGenerating: boolean;
  error: string | null;
  gallery: GalleryEntry[];

  setConfig: (patch: Partial<ImageGenConfig>) => void;
  /** Generate an image and return its data URI, or null on failure. */
  generate: (prompt: string, negativePrompt?: string) => Promise<string | null>;
  clearError: () => void;
  addToGallery: (entry: GalleryEntry) => void;
  removeFromGallery: (id: string) => void;
  clearGallery: () => void;
}

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  ...loadConfig(),
  isGenerating: false,
  error: null,
  gallery: loadGallery(),

  setConfig: (patch) => {
    set((s) => {
      const next = { ...s, ...patch };
      const config: ImageGenConfig = {
        backend: next.backend,
        sdUrl: next.sdUrl,
        sdAuth: next.sdAuth,
        pollinationsModel: next.pollinationsModel,
        dalleModel: next.dalleModel,
        dalleQuality: next.dalleQuality,
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
    const {
      backend, sdUrl, sdAuth, pollinationsModel,
      dalleModel, dalleQuality, width, height, steps, cfgScale,
    } = get();
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
      } else if (backend === 'dalle') {
        const size = nearestDalleSize(width, height, dalleModel);
        result = await imageGenApi.generateDalle({
          prompt,
          model: dalleModel,
          size,
          quality: dalleQuality,
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

      const dataUrl = `data:image/${result.format};base64,${result.base64}`;

      // Auto-save to gallery
      const entry: GalleryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl,
        prompt,
        backend,
        timestamp: Date.now(),
      };
      get().addToGallery(entry);

      set({ isGenerating: false });
      return dataUrl;
    } catch (e) {
      set({ isGenerating: false, error: e instanceof Error ? e.message : 'Generation failed' });
      return null;
    }
  },

  clearError: () => set({ error: null }),

  addToGallery: (entry) => {
    set((s) => {
      const gallery = [entry, ...s.gallery];
      saveGallery(gallery);
      return { gallery };
    });
  },

  removeFromGallery: (id) => {
    set((s) => {
      const gallery = s.gallery.filter((e) => e.id !== id);
      saveGallery(gallery);
      return { gallery };
    });
  },

  clearGallery: () => {
    saveGallery([]);
    set({ gallery: [] });
  },
}));
