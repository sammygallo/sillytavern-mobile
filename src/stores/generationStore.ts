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

export type CompletionMode = 'chat' | 'text';

export interface InstructConfig {
  enabled: boolean;
  templateId: string;
  /** Extra stop strings applied on top of template defaults. */
  extraStopStrings: string[];
  /** Phase 10.3: 'chat' sends messages array, 'text' sends a single prompt string. */
  completionMode: CompletionMode;
}

export const DEFAULT_INSTRUCT_CONFIG: InstructConfig = {
  enabled: false,
  templateId: 'chatml',
  extraStopStrings: [],
  completionMode: 'chat',
};

/** Phase 9.1: stable IDs for every reorderable prompt section. */
export type PromptSectionId =
  | 'main_prompt'
  | 'persona_before_char'
  | 'wi_before_char'
  | 'ext_before_char'
  | 'char_info_block'
  | 'wi_after_char'
  | 'ext_after_char'
  | 'persona_after_char'
  | 'wi_before_an'
  | 'ext_before_an'
  | 'jailbreak'
  | 'emotion_instruction'
  | 'rag_context'
  | 'char_phi'
  | 'user_phi'
  | 'wi_after_an'
  | 'ext_after_an';

export interface PromptSectionEntry {
  id: PromptSectionId;
  enabled: boolean;
}

export const DEFAULT_PROMPT_ORDER: PromptSectionEntry[] = [
  { id: 'main_prompt', enabled: true },
  { id: 'persona_before_char', enabled: true },
  { id: 'wi_before_char', enabled: true },
  { id: 'ext_before_char', enabled: true },
  { id: 'char_info_block', enabled: true },
  { id: 'wi_after_char', enabled: true },
  { id: 'ext_after_char', enabled: true },
  { id: 'persona_after_char', enabled: true },
  { id: 'wi_before_an', enabled: true },
  { id: 'ext_before_an', enabled: true },
  { id: 'jailbreak', enabled: true },
  { id: 'emotion_instruction', enabled: true },
  { id: 'rag_context', enabled: true },
  { id: 'char_phi', enabled: true },
  { id: 'user_phi', enabled: true },
  { id: 'wi_after_an', enabled: true },
  { id: 'ext_after_an', enabled: true },
];

/** Sections emitted AFTER the chat history (post-history stage). */
export const POST_HISTORY_SECTIONS: ReadonlySet<PromptSectionId> = new Set<PromptSectionId>([
  'char_phi',
  'user_phi',
  'wi_after_an',
  'ext_after_an',
]);

export const PROMPT_SECTION_LABELS: Record<PromptSectionId, string> = {
  main_prompt: 'Main / System Prompt',
  persona_before_char: 'Persona (before character)',
  wi_before_char: 'World Info — Before Char',
  ext_before_char: 'Extensions — Before Char',
  char_info_block: 'Character Info (desc / personality / scenario / examples)',
  wi_after_char: 'World Info — After Char',
  ext_after_char: 'Extensions — After Char',
  persona_after_char: 'Persona (after character)',
  wi_before_an: 'World Info — Before Author Note',
  ext_before_an: 'Extensions — Before Author Note',
  jailbreak: 'Jailbreak / Auxiliary Prompt',
  emotion_instruction: 'Emotion Tag Instruction',
  rag_context: 'Data Bank / RAG Context',
  char_phi: 'Character Post-History Instructions',
  user_phi: 'User Post-History Instructions',
  wi_after_an: 'World Info — After Author Note',
  ext_after_an: 'Extensions — After Author Note',
};

export const PROMPT_SECTION_DESCRIPTIONS: Record<PromptSectionId, string> = {
  main_prompt: 'The top-level system instruction. Character card overrides win when respected.',
  persona_before_char: 'Your persona description, when positioned before the character block.',
  wi_before_char: 'World Info entries marked "before character".',
  ext_before_char: 'Extension-injected context marked "before character".',
  char_info_block: 'Description + personality + scenario + example dialogue.',
  wi_after_char: 'World Info entries marked "after character".',
  ext_after_char: 'Extension-injected context marked "after character".',
  persona_after_char: 'Your persona description, when positioned after the character block.',
  wi_before_an: 'World Info entries marked "before author note".',
  ext_before_an: 'Extension-injected context marked "before author note".',
  jailbreak: 'User-level jailbreak / auxiliary system prompt.',
  emotion_instruction: 'Instructs the AI to prefix each reply with an [emotion:TAG] tag.',
  rag_context: 'Semantic chunks retrieved from the Data Bank for the current message.',
  char_phi: "Character card's post-history instructions (after chat history).",
  user_phi: 'User-level post-history instructions (after chat history).',
  wi_after_an: 'World Info entries marked "after author note" (after chat history).',
  ext_after_an: 'Extension-injected context marked "after author note" (after chat history).',
};

interface GenerationState {
  sampler: SamplerParams;
  presets: GenerationPreset[];
  activePresetId: string | null;

  prompt: PromptConfig;
  context: ContextConfig;
  instruct: InstructConfig;
  /** Phase 9.1: user-editable prompt section order + enabled flags. */
  promptOrder: PromptSectionEntry[];

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

  setPromptOrder: (order: PromptSectionEntry[]) => void;
  movePromptSection: (id: PromptSectionId, direction: 'up' | 'down') => void;
  togglePromptSection: (id: PromptSectionId) => void;
  resetPromptOrder: () => void;

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
  promptOrder?: PromptSectionEntry[];
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
    promptOrder: state.promptOrder,
  });
}

function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Merge a persisted promptOrder with the default. Unknown/legacy IDs are
 * dropped, and any sections that exist in the default but not in the persisted
 * array are appended at the end with `enabled: true` (forward-compat).
 */
export function mergePromptOrder(
  persisted: PromptSectionEntry[] | undefined
): PromptSectionEntry[] {
  if (!Array.isArray(persisted) || persisted.length === 0) {
    return DEFAULT_PROMPT_ORDER.map((e) => ({ ...e }));
  }
  const knownIds = new Set<PromptSectionId>(DEFAULT_PROMPT_ORDER.map((e) => e.id));
  const seen = new Set<PromptSectionId>();
  const result: PromptSectionEntry[] = [];
  for (const entry of persisted) {
    if (!entry || typeof entry.id !== 'string') continue;
    if (!knownIds.has(entry.id as PromptSectionId)) continue;
    if (seen.has(entry.id as PromptSectionId)) continue;
    seen.add(entry.id as PromptSectionId);
    result.push({ id: entry.id as PromptSectionId, enabled: entry.enabled !== false });
  }
  for (const def of DEFAULT_PROMPT_ORDER) {
    if (!seen.has(def.id)) {
      result.push({ ...def });
    }
  }
  return result;
}

const initial = loadFromStorage();

export const useGenerationStore = create<GenerationState>((set, get) => ({
  sampler: { ...DEFAULT_SAMPLER, ...(initial.sampler ?? {}) },
  presets: initial.presets ?? [],
  activePresetId: initial.activePresetId ?? null,
  prompt: { ...DEFAULT_PROMPT_CONFIG, ...(initial.prompt ?? {}) },
  context: { ...DEFAULT_CONTEXT_CONFIG, ...(initial.context ?? {}) },
  instruct: { ...DEFAULT_INSTRUCT_CONFIG, ...(initial.instruct ?? {}) },
  promptOrder: mergePromptOrder(initial.promptOrder),
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

  setPromptOrder: (order) => {
    set((state) => {
      const next = { ...state, promptOrder: mergePromptOrder(order) };
      persist(next);
      return { promptOrder: next.promptOrder };
    });
  },

  movePromptSection: (id, direction) => {
    set((state) => {
      const idx = state.promptOrder.findIndex((e) => e.id === id);
      if (idx < 0) return {};
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= state.promptOrder.length) return {};
      const nextOrder = state.promptOrder.slice();
      const [moved] = nextOrder.splice(idx, 1);
      nextOrder.splice(target, 0, moved);
      const next = { ...state, promptOrder: nextOrder };
      persist(next);
      return { promptOrder: nextOrder };
    });
  },

  togglePromptSection: (id) => {
    set((state) => {
      const nextOrder = state.promptOrder.map((e) =>
        e.id === id ? { ...e, enabled: !e.enabled } : e
      );
      const next = { ...state, promptOrder: nextOrder };
      persist(next);
      return { promptOrder: nextOrder };
    });
  },

  resetPromptOrder: () => {
    set((state) => {
      const nextOrder = DEFAULT_PROMPT_ORDER.map((e) => ({ ...e }));
      const next = { ...state, promptOrder: nextOrder };
      persist(next);
      return { promptOrder: nextOrder };
    });
  },

  setLastTokenEstimate: (n) => {
    set({ lastTokenEstimate: n });
  },
}));
