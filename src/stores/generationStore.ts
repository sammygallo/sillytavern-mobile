import { create } from 'zustand';
import { getDefaultContextSize } from '../utils/tokenizer';

// Sampler parameters supported across providers. Not every provider uses
// every field; unused params are ignored by the backend.
export interface SamplerParams {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  minP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  repetitionPenalty: number;
  /** Custom stopping strings (one per line in UI). */
  stopStrings: string[];
}

export const DEFAULT_SAMPLER: SamplerParams = {
  temperature: 0.9,
  maxTokens: 1024,
  topP: 1.0,
  topK: 0,
  minP: 0.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  repetitionPenalty: 1.0,
  stopStrings: [],
};

export interface GenerationPreset {
  id: string;
  name: string;
  sampler: SamplerParams;
  createdAt: number;
}

export interface PromptConfig {
  /** Replaces the default "You are {{char}}" opener when non-empty. */
  mainPrompt: string;
  /** Appended as a final system message before generation. */
  postHistoryInstructions: string;
  /** Auxiliary prompt inserted into the system block. */
  jailbreakPrompt: string;
  /** Toggle whether the character's system_prompt override is honored. */
  respectCharacterOverride: boolean;
  /** Toggle whether post-history instructions from the card are honored. */
  respectCharacterPHI: boolean;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  mainPrompt: '',
  postHistoryInstructions: '',
  jailbreakPrompt: '',
  respectCharacterOverride: true,
  respectCharacterPHI: true,
};

export interface ContextConfig {
  /** Total token budget (including system + history + reserved response). */
  maxTokens: number;
  /** Tokens to reserve for the AI response (subtracted from maxTokens). */
  responseReserve: number;
  /** When true, use token-aware trimming; else use fixed message count. */
  tokenAware: boolean;
  /** Fixed message count fallback when tokenAware is false. */
  messageCount: number;
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTokens: 8192,
  responseReserve: 1024,
  tokenAware: true,
  messageCount: 20,
};

export interface InstructConfig {
  enabled: boolean;
  templateId: string;
  /** Extra stop strings applied on top of template defaults. */
  extraStopStrings: string[];
}

export const DEFAULT_INSTRUCT_CONFIG: InstructConfig = {
  enabled: false,
  templateId: 'chatml',
  extraStopStrings: [],
};

interface GenerationState {
  sampler: SamplerParams;
  presets: GenerationPreset[];
  activePresetId: string | null;

  prompt: PromptConfig;
  context: ContextConfig;
  instruct: InstructConfig;

  // Cached last-used token estimate for the UI badge
  lastTokenEstimate: number;

  // Actions
  setSampler: (sampler: Partial<SamplerParams>) => void;
  resetSampler: () => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;

  setPrompt: (prompt: Partial<PromptConfig>) => void;
  resetPrompt: () => void;

  setContext: (context: Partial<ContextConfig>) => void;
  applyProviderDefaults: (provider: string) => void;

  setInstruct: (instruct: Partial<InstructConfig>) => void;

  setLastTokenEstimate: (n: number) => void;
}

const STORAGE_KEY = 'sillytavern_generation_settings_v1';

interface PersistedShape {
  sampler: SamplerParams;
  presets: GenerationPreset[];
  activePresetId: string | null;
  prompt: PromptConfig;
  context: ContextConfig;
  instruct: InstructConfig;
}

function loadFromStorage(): Partial<PersistedShape> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedShape;
  } catch {
    return {};
  }
}

function saveToStorage(state: PersistedShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota etc.)
  }
}

function persist(state: GenerationState) {
  saveToStorage({
    sampler: state.sampler,
    presets: state.presets,
    activePresetId: state.activePresetId,
    prompt: state.prompt,
    context: state.context,
    instruct: state.instruct,
  });
}

function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const initial = loadFromStorage();

export const useGenerationStore = create<GenerationState>((set, get) => ({
  sampler: { ...DEFAULT_SAMPLER, ...(initial.sampler ?? {}) },
  presets: initial.presets ?? [],
  activePresetId: initial.activePresetId ?? null,
  prompt: { ...DEFAULT_PROMPT_CONFIG, ...(initial.prompt ?? {}) },
  context: { ...DEFAULT_CONTEXT_CONFIG, ...(initial.context ?? {}) },
  instruct: { ...DEFAULT_INSTRUCT_CONFIG, ...(initial.instruct ?? {}) },
  lastTokenEstimate: 0,

  setSampler: (patch) => {
    set((state) => {
      const next = { ...state, sampler: { ...state.sampler, ...patch } };
      persist(next);
      return { sampler: next.sampler };
    });
  },

  resetSampler: () => {
    set((state) => {
      const next = { ...state, sampler: { ...DEFAULT_SAMPLER } };
      persist(next);
      return { sampler: next.sampler };
    });
  },

  savePreset: (name) => {
    const { sampler, presets } = get();
    const trimmed = name.trim();
    if (!trimmed) return;
    const preset: GenerationPreset = {
      id: generatePresetId(),
      name: trimmed,
      sampler: { ...sampler },
      createdAt: Date.now(),
    };
    const nextPresets = [...presets, preset];
    set((state) => {
      const next = {
        ...state,
        presets: nextPresets,
        activePresetId: preset.id,
      };
      persist(next);
      return { presets: nextPresets, activePresetId: preset.id };
    });
  },

  loadPreset: (id) => {
    const { presets } = get();
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    set((state) => {
      const next = {
        ...state,
        sampler: { ...preset.sampler },
        activePresetId: preset.id,
      };
      persist(next);
      return { sampler: next.sampler, activePresetId: preset.id };
    });
  },

  deletePreset: (id) => {
    const { presets, activePresetId } = get();
    const nextPresets = presets.filter((p) => p.id !== id);
    const nextActive = activePresetId === id ? null : activePresetId;
    set((state) => {
      const next = {
        ...state,
        presets: nextPresets,
        activePresetId: nextActive,
      };
      persist(next);
      return { presets: nextPresets, activePresetId: nextActive };
    });
  },

  setPrompt: (patch) => {
    set((state) => {
      const next = { ...state, prompt: { ...state.prompt, ...patch } };
      persist(next);
      return { prompt: next.prompt };
    });
  },

  resetPrompt: () => {
    set((state) => {
      const next = { ...state, prompt: { ...DEFAULT_PROMPT_CONFIG } };
      persist(next);
      return { prompt: next.prompt };
    });
  },

  setContext: (patch) => {
    set((state) => {
      const next = { ...state, context: { ...state.context, ...patch } };
      persist(next);
      return { context: next.context };
    });
  },

  applyProviderDefaults: (provider) => {
    const defaultSize = getDefaultContextSize(provider);
    set((state) => {
      const next = {
        ...state,
        context: { ...state.context, maxTokens: defaultSize },
      };
      persist(next);
      return { context: next.context };
    });
  },

  setInstruct: (patch) => {
    set((state) => {
      const next = { ...state, instruct: { ...state.instruct, ...patch } };
      persist(next);
      return { instruct: next.instruct };
    });
  },

  setLastTokenEstimate: (n) => {
    set({ lastTokenEstimate: n });
  },
}));
