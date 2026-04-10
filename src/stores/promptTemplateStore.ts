import { create } from 'zustand';
import {
  useGenerationStore,
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_INSTRUCT_CONFIG,
  DEFAULT_SAMPLER,
  mergePromptOrder,
  type PromptConfig,
  type ContextConfig,
  type InstructConfig,
  type SamplerParams,
  type PromptSectionEntry,
} from './generationStore';

/**
 * Phase 9.2 — Prompt Templates & Presets.
 *
 * A PromptTemplate bundles an entire generation-side configuration so users
 * can save, load, export, and share a full "persona setup" — not just
 * samplers (which existing GenerationPreset already covers).
 */
export interface PromptTemplate {
  id: string;
  name: string;
  prompt: PromptConfig;
  context: ContextConfig;
  instruct: InstructConfig;
  promptOrder: PromptSectionEntry[];
  /** Optional — only set when user opts in to "include samplers" on save. */
  sampler?: SamplerParams;
  createdAt: number;
}

interface PromptTemplateState {
  templates: PromptTemplate[];
  activeTemplateId: string | null;

  saveTemplate: (name: string, includeSampler: boolean) => void;
  loadTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;
  importTemplates: (json: string) => { imported: number; errors: number };
  exportTemplates: () => string;
  exportTemplate: (id: string) => string | null;
}

const STORAGE_KEY = 'stm:prompt-templates';

interface PersistedShape {
  templates: PromptTemplate[];
  activeTemplateId: string | null;
}

function loadFromStorage(): PersistedShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { templates: [], activeTemplateId: null };
    const parsed = JSON.parse(raw) as PersistedShape;
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      activeTemplateId:
        typeof parsed.activeTemplateId === 'string' ? parsed.activeTemplateId : null,
    };
  } catch {
    return { templates: [], activeTemplateId: null };
  }
}

function saveToStorage(state: PersistedShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function generateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function coerceTemplate(raw: unknown): PromptTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  if (!r.prompt || typeof r.prompt !== 'object') return null;
  const prompt = { ...DEFAULT_PROMPT_CONFIG, ...(r.prompt as Partial<PromptConfig>) };
  const context = { ...DEFAULT_CONTEXT_CONFIG, ...((r.context as Partial<ContextConfig>) ?? {}) };
  const instruct = {
    ...DEFAULT_INSTRUCT_CONFIG,
    ...((r.instruct as Partial<InstructConfig>) ?? {}),
  };
  const promptOrder = mergePromptOrder(
    Array.isArray(r.promptOrder) ? (r.promptOrder as PromptSectionEntry[]) : undefined
  );
  const sampler =
    r.sampler && typeof r.sampler === 'object'
      ? { ...DEFAULT_SAMPLER, ...(r.sampler as Partial<SamplerParams>) }
      : undefined;
  return {
    id: generateId(),
    name: r.name.trim(),
    prompt,
    context,
    instruct,
    promptOrder,
    sampler,
    createdAt: Date.now(),
  };
}

const initial = loadFromStorage();

export const usePromptTemplateStore = create<PromptTemplateState>((set, get) => ({
  templates: initial.templates,
  activeTemplateId: initial.activeTemplateId,

  saveTemplate: (name, includeSampler) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const gen = useGenerationStore.getState();
    const template: PromptTemplate = {
      id: generateId(),
      name: trimmed,
      prompt: { ...gen.prompt },
      context: { ...gen.context },
      instruct: { ...gen.instruct },
      promptOrder: gen.promptOrder.map((e) => ({ ...e })),
      sampler: includeSampler ? { ...gen.sampler } : undefined,
      createdAt: Date.now(),
    };
    const { templates } = get();
    const nextTemplates = [...templates, template];
    saveToStorage({ templates: nextTemplates, activeTemplateId: template.id });
    set({ templates: nextTemplates, activeTemplateId: template.id });
  },

  loadTemplate: (id) => {
    const { templates } = get();
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const gen = useGenerationStore.getState();
    gen.setPrompt(template.prompt);
    gen.setContext(template.context);
    gen.setInstruct(template.instruct);
    gen.setPromptOrder(template.promptOrder);
    if (template.sampler) {
      gen.setSampler(template.sampler);
    }
    saveToStorage({ templates, activeTemplateId: template.id });
    set({ activeTemplateId: template.id });
  },

  deleteTemplate: (id) => {
    const { templates, activeTemplateId } = get();
    const nextTemplates = templates.filter((t) => t.id !== id);
    const nextActive = activeTemplateId === id ? null : activeTemplateId;
    saveToStorage({ templates: nextTemplates, activeTemplateId: nextActive });
    set({ templates: nextTemplates, activeTemplateId: nextActive });
  },

  renameTemplate: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { templates, activeTemplateId } = get();
    const nextTemplates = templates.map((t) =>
      t.id === id ? { ...t, name: trimmed } : t
    );
    saveToStorage({ templates: nextTemplates, activeTemplateId });
    set({ templates: nextTemplates });
  },

  importTemplates: (json) => {
    let imported = 0;
    let errors = 0;
    try {
      const parsed = JSON.parse(json);
      const arr: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { templates?: unknown[] })?.templates)
          ? (parsed as { templates: unknown[] }).templates
          : [];

      if (arr.length === 0) return { imported: 0, errors: 0 };

      const { templates, activeTemplateId } = get();
      const newTemplates: PromptTemplate[] = [];
      for (const raw of arr) {
        const t = coerceTemplate(raw);
        if (t) {
          newTemplates.push(t);
          imported++;
        } else {
          errors++;
        }
      }
      if (newTemplates.length === 0) return { imported: 0, errors };

      const nextTemplates = [...templates, ...newTemplates];
      saveToStorage({ templates: nextTemplates, activeTemplateId });
      set({ templates: nextTemplates });
      return { imported, errors };
    } catch {
      return { imported: 0, errors: 1 };
    }
  },

  exportTemplates: () => {
    const { templates } = get();
    return JSON.stringify({ version: 1, templates }, null, 2);
  },

  exportTemplate: (id) => {
    const { templates } = get();
    const t = templates.find((x) => x.id === id);
    if (!t) return null;
    return JSON.stringify({ version: 1, templates: [t] }, null, 2);
  },
}));
