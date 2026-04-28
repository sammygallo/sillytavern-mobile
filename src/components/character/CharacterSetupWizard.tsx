import { useState } from 'react';
import { Wand2, ArrowLeft, ArrowRight, Check, Sparkles, Link2, ChevronDown, ChevronUp, FileText, BookOpen } from 'lucide-react';
import { Modal, Button } from '../ui';
import { useGenerationStore } from '../../stores/generationStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import {
  buildHypercodePrompt,
  buildHypercodeName,
  inferHypercodeFromWizard,
  estimateHypercodeTokens,
  HYPERCODE_TIER_BLURB,
  HYPERCODE_TIER_LABEL,
  HYPERCODE_TIER_TOKEN_BASELINE,
  HYPERCODE_POV_LABEL,
  HYPERCODE_TENSE_LABEL,
  HYPERCODE_LENGTH_LABEL,
  HYPERCODE_TONE_LABEL,
  HYPERCODE_DIALOGUE_LABEL,
  HYPERCODE_MATURE_LABEL,
  type HypercodeConfig,
  type HypercodeTier,
  type HypercodePOV,
  type HypercodeTense,
  type HypercodeLength,
  type HypercodeTone,
  type HypercodeDialogue,
  type HypercodeMature,
} from '../../utils/hypercode';
import { estimateTokens } from '../../utils/tokenizer';

// ─── Types ────────────────────────────────────────────────────────────────────

type Purpose = 'roleplay' | 'companion' | 'assistant' | 'creative';
type ResponseLength = 'snappy' | 'balanced' | 'elaborate';
type ModelTier = 'flagship' | 'mid' | 'local';

interface WizardAnswers {
  purpose: Purpose | null;
  length: ResponseLength | null;
  tier: ModelTier | null;
}

/**
 * The wizard answers once all three steps are complete. `Required<>` doesn't
 * strip `null` from a union, so we declare an explicit non-null type and use
 * `CompletedAnswers` only as a "completeness" check elsewhere.
 */
interface CompletedAnswers {
  purpose: Purpose;
  length: ResponseLength;
  tier: ModelTier;
}

interface Recommendation {
  temperature: number;
  maxTokens: number;
  topP: number;
  minP: number;
  frequencyPenalty: number;
  presetLabel: string;
  fieldTips: {
    description: string;
    personality: string;
    firstMessage: string;
    scenario: string;
  };
}

// ─── Recommendation matrix ────────────────────────────────────────────────────

// Conservative defaults: frequencyPenalty 0 across the board (was 0.1–0.3 —
// opinionated, and not all providers handle the same way). Users who want
// repetition control can tune it up via Generation Settings.
const BASE: Record<Purpose, Record<ResponseLength, Pick<Recommendation, 'temperature' | 'maxTokens' | 'topP' | 'minP' | 'frequencyPenalty'>>> = {
  roleplay: {
    snappy:   { temperature: 0.80, maxTokens: 400,  topP: 0.95, minP: 0.05, frequencyPenalty: 0.0 },
    balanced: { temperature: 0.85, maxTokens: 800,  topP: 0.95, minP: 0.05, frequencyPenalty: 0.0 },
    elaborate:{ temperature: 0.90, maxTokens: 1500, topP: 0.97, minP: 0.05, frequencyPenalty: 0.0 },
  },
  companion: {
    snappy:   { temperature: 0.70, maxTokens: 300,  topP: 0.90, minP: 0.05, frequencyPenalty: 0.0 },
    balanced: { temperature: 0.75, maxTokens: 600,  topP: 0.92, minP: 0.05, frequencyPenalty: 0.0 },
    elaborate:{ temperature: 0.80, maxTokens: 1200, topP: 0.95, minP: 0.05, frequencyPenalty: 0.0 },
  },
  assistant: {
    snappy:   { temperature: 0.40, maxTokens: 256,  topP: 0.85, minP: 0.05, frequencyPenalty: 0.0 },
    balanced: { temperature: 0.50, maxTokens: 512,  topP: 0.90, minP: 0.05, frequencyPenalty: 0.0 },
    elaborate:{ temperature: 0.60, maxTokens: 1024, topP: 0.92, minP: 0.05, frequencyPenalty: 0.0 },
  },
  creative: {
    snappy:   { temperature: 0.90, maxTokens: 600,  topP: 0.98, minP: 0.02, frequencyPenalty: 0.0 },
    balanced: { temperature: 0.95, maxTokens: 1200, topP: 0.98, minP: 0.02, frequencyPenalty: 0.0 },
    elaborate:{ temperature: 1.00, maxTokens: 2048, topP: 0.99, minP: 0.02, frequencyPenalty: 0.0 },
  },
};

const TIER_ADJUSTMENTS: Record<ModelTier, { tempDelta: number; topPDelta: number }> = {
  flagship: { tempDelta: 0,     topPDelta: 0 },
  mid:      { tempDelta: -0.05, topPDelta: -0.01 },
  local:    { tempDelta: -0.10, topPDelta: -0.03 },
};

const FIELD_TIPS: Record<Purpose, Recommendation['fieldTips']> = {
  roleplay: {
    description: 'Paint a vivid picture: physical appearance, world context, history. The AI uses this as its mental image of the character.',
    personality: 'Focus on speech patterns, emotional tendencies, and quirks. Phrases like "speaks in short, clipped sentences" or "always deflects with humor" work well.',
    firstMessage: 'Set the scene. Open mid-action or mid-moment rather than a generic greeting. 2–4 paragraphs with sensory detail works great for immersion.',
    scenario: 'Describe the specific situation when the chat begins — location, what just happened, the stakes. Keep it focused rather than world-building everything here.',
  },
  companion: {
    description: 'Describe who they are and their relationship to the user. Keep it grounded — this character exists in a comfortable, familiar space.',
    personality: 'Warm, specific traits. How do they react when happy? Nervous? What do they tease you about? The more specific, the more consistent the AI will be.',
    firstMessage: 'A natural, casual opening that matches their vibe. Think of how a friend texts you — could be playful, could be checking in. Should feel effortless.',
    scenario: 'Optional for companions. If you use it, keep it simple — "we\'re in your apartment" or "we just got back from lunch" is enough context.',
  },
  assistant: {
    description: 'Define their role and area of expertise clearly. E.g., "a senior software engineer specializing in Python and system design." Specificity improves accuracy.',
    personality: 'Tone and communication style. Formal vs. casual, direct vs. collaborative, verbose vs. terse. Match this to how you want to be spoken to.',
    firstMessage: 'A brief, confident intro that offers to help. State what they can do and invite a question. Keep it under 2 sentences.',
    scenario: 'Usually not needed for assistants. Leave blank or use it to provide standing context like "you\'re my coding partner on a TypeScript project."',
  },
  creative: {
    description: 'Their creative identity — style, genre, influences, strengths. E.g., "a noir fiction author obsessed with moral ambiguity and sharp dialogue."',
    personality: 'How they collaborate. Are they a bold co-author who takes charge, or a supportive partner who builds on your ideas? Do they challenge you or go with the flow?',
    firstMessage: 'Spark something. Offer a fragment of prose, pose a "what if," or share an observation that invites creative response.',
    scenario: 'The project or creative context. "We\'re co-writing a fantasy novel. The protagonist just made a choice that will haunt her." Seed the story.',
  },
};

const PRESET_LABELS: Record<Purpose, Record<ResponseLength, string>> = {
  roleplay:  { snappy: 'Roleplay — Reactive', balanced: 'Roleplay — Balanced', elaborate: 'Roleplay — Immersive' },
  companion: { snappy: 'Companion — Quick', balanced: 'Companion — Natural', elaborate: 'Companion — Chatty' },
  assistant: { snappy: 'Assistant — Terse', balanced: 'Assistant — Balanced', elaborate: 'Assistant — Detailed' },
  creative:  { snappy: 'Creative — Spark', balanced: 'Creative — Flowing', elaborate: 'Creative — Immersive' },
};

function buildRecommendation(answers: CompletedAnswers): Recommendation {
  const base = BASE[answers.purpose][answers.length];
  const adj = TIER_ADJUSTMENTS[answers.tier];
  return {
    ...base,
    temperature: Math.round((base.temperature + adj.tempDelta) * 100) / 100,
    topP: Math.round((base.topP + adj.topPDelta) * 100) / 100,
    presetLabel: PRESET_LABELS[answers.purpose][answers.length],
    fieldTips: FIELD_TIPS[answers.purpose],
  };
}

// ─── Step option cards ────────────────────────────────────────────────────────

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  description: string;
}

function OptionCard({ selected, onClick, icon, label, description }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:border-[var(--color-primary)]/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
            {label}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
        {selected && (
          <Check size={16} className="shrink-0 text-[var(--color-primary)] mt-0.5 ml-auto" />
        )}
      </div>
    </button>
  );
}

// ─── Individual steps ────────────────────────────────────────────────────────

function StepPurpose({ value, onChange }: { value: Purpose | null; onChange: (v: Purpose) => void }) {
  const options: { value: Purpose; icon: string; label: string; description: string }[] = [
    { value: 'roleplay',  icon: '🎭', label: 'Immersive Roleplay',  description: 'Deep character immersion, narrative storytelling, scene-setting' },
    { value: 'companion', icon: '💬', label: 'Casual Companion',    description: 'Everyday chat, friendly banter, emotional support' },
    { value: 'assistant', icon: '🤖', label: 'AI Assistant',        description: 'Task help, questions, research, productivity' },
    { value: 'creative',  icon: '✍️', label: 'Creative Writing',    description: 'Co-authoring stories, brainstorming, worldbuilding' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--color-text-secondary)] mb-3">
        Choose the primary way you'll use this character. This shapes generation settings and gives you tailored field-filling tips.
      </p>
      {options.map((o) => (
        <OptionCard key={o.value} selected={value === o.value} onClick={() => onChange(o.value)} {...o} />
      ))}
    </div>
  );
}

function StepLength({ value, onChange }: { value: ResponseLength | null; onChange: (v: ResponseLength) => void }) {
  const options: { value: ResponseLength; icon: string; label: string; description: string }[] = [
    { value: 'snappy',   icon: '⚡', label: 'Snappy',   description: 'Short, punchy replies — keeps the conversation moving fast' },
    { value: 'balanced', icon: '⚖️', label: 'Balanced', description: 'Natural back-and-forth — neither terse nor rambling' },
    { value: 'elaborate',icon: '📖', label: 'Elaborate', description: 'Rich, detailed responses — ideal for immersive or in-depth exchanges' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--color-text-secondary)] mb-3">
        How long should the AI's responses typically be?
      </p>
      {options.map((o) => (
        <OptionCard key={o.value} selected={value === o.value} onClick={() => onChange(o.value)} {...o} />
      ))}
    </div>
  );
}

function StepModelTier({ value, onChange }: { value: ModelTier | null; onChange: (v: ModelTier) => void }) {
  const options: { value: ModelTier; icon: string; label: string; description: string }[] = [
    { value: 'flagship', icon: '🚀', label: 'Flagship model',    description: 'Claude Opus, GPT-4o, Gemini Ultra — handles high creativity well' },
    { value: 'mid',      icon: '⚡', label: 'Mid-tier model',    description: 'Claude Sonnet, GPT-4o-mini, Gemini Flash — great balance of speed and quality' },
    { value: 'local',    icon: '🏠', label: 'Local / budget',    description: 'llama.cpp, KoboldCpp, Mistral — benefits from slightly lower temperature' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--color-text-secondary)] mb-3">
        Which type of AI model are you using? This fine-tunes temperature for best results.
      </p>
      {options.map((o) => (
        <OptionCard key={o.value} selected={value === o.value} onClick={() => onChange(o.value)} {...o} />
      ))}
    </div>
  );
}

// ─── HYPERCODE section (shown for narrative purposes only) ────────────────────

interface HypercodeSectionProps {
  initialConfig: HypercodeConfig;
  characterName?: string;
  characterAvatar?: string;
  /** Callback to write the composed prompt into the character's
   *  systemPromptOverride field. Receives the prompt text. */
  onApplyToCharacter?: (text: string) => void;
  /** The character's existing systemPromptOverride. Used to warn before
   *  overwriting non-empty values. */
  existingSystemPromptOverride?: string;
  /** Estimated tokens currently consumed by the character's other card
   *  fields (description + personality + scenario + first message etc.).
   *  Used in the token budget summary. */
  characterFieldsTokens?: number;
  /** Max response tokens currently configured — used to compute headroom. */
  maxResponseTokens?: number;
  /** Total context budget — used to compute headroom. */
  contextBudget?: number;
}

function MiniSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-2 py-1 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function HypercodeSection({
  initialConfig,
  characterName,
  characterAvatar,
  onApplyToCharacter,
  existingSystemPromptOverride,
  characterFieldsTokens,
  maxResponseTokens,
  contextBudget,
}: HypercodeSectionProps) {
  const [cfg, setCfg] = useState<HypercodeConfig>(initialConfig);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [appliedToChar, setAppliedToChar] = useState(false);
  const [linkedTemplateId, setLinkedTemplateId] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const saveTemplateWithPrompt = usePromptTemplateStore((s) => s.saveTemplateWithPrompt);
  const saveTemplateWithPromptAndLink = usePromptTemplateStore(
    (s) => s.saveTemplateWithPromptAndLink
  );

  const set = <K extends keyof HypercodeConfig>(key: K, val: HypercodeConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    setAppliedToChar(false);
    setSavedTemplate(false);
    setLinkedTemplateId(null);
  };

  const summary = `${HYPERCODE_TIER_LABEL[cfg.tier]} · ${HYPERCODE_TONE_LABEL[cfg.tone]} · ${HYPERCODE_POV_LABEL[cfg.pov]} · ${HYPERCODE_LENGTH_LABEL[cfg.length]}`;

  // Live token estimate of the currently-composed prompt (cheap to compute).
  const promptTokens = estimateHypercodeTokens(cfg);

  const writeToCharacter = () => {
    if (!onApplyToCharacter) return;
    onApplyToCharacter(buildHypercodePrompt(cfg));
    setAppliedToChar(true);
    setPendingOverwrite(false);
  };

  const handleSetOnCard = () => {
    // If the character already has a non-empty override, require explicit
    // confirmation before clobbering — never silent destruction.
    if (existingSystemPromptOverride && existingSystemPromptOverride.trim().length > 0) {
      setPendingOverwrite(true);
      return;
    }
    writeToCharacter();
  };

  const handleSaveAndLinkTemplate = () => {
    if (!characterAvatar) return;
    const id = saveTemplateWithPromptAndLink(
      buildHypercodeName(cfg),
      buildHypercodePrompt(cfg),
      characterAvatar
    );
    setLinkedTemplateId(id);
  };

  const handleSaveTemplate = () => {
    saveTemplateWithPrompt(buildHypercodeName(cfg), buildHypercodePrompt(cfg));
    setSavedTemplate(true);
  };

  const tierBtnClass = (t: HypercodeTier) =>
    `flex-1 py-1 text-[11px] rounded-md border transition-colors flex flex-col items-center gap-0.5 ${
      cfg.tier === t
        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white font-semibold'
        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/60'
    }`;

  // Token budget calculations — show real numbers, not adjectives.
  const fieldTokens = characterFieldsTokens ?? 0;
  const totalSystemPrompt = promptTokens + fieldTokens;
  const replyBudget = maxResponseTokens ?? 0;
  const ctx = contextBudget ?? 0;
  const headroom = ctx > 0 ? ctx - totalSystemPrompt - replyBudget : 0;

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
        System Prompt — HYPERCODE
      </p>
      <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3 space-y-3">
        {/* Inferred summary with token cost */}
        <div className="flex items-start gap-2">
          <BookOpen size={14} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">
                Inferred from your answers
              </p>
              <span className="font-mono text-[10px] text-[var(--color-primary)]">
                ~{promptTokens} tok / turn
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
              {summary}
            </p>
          </div>
        </div>

        {/* Token budget block — real numbers, not adjectives */}
        {(fieldTokens > 0 || replyBudget > 0 || ctx > 0) && (
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md p-2 space-y-1">
            <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
              Token budget per turn
            </p>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary)]">HYPERCODE prompt</span>
              <span className="font-mono text-[var(--color-text-primary)]">~{promptTokens}</span>
            </div>
            {fieldTokens > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--color-text-secondary)]">Character fields</span>
                <span className="font-mono text-[var(--color-text-primary)]">~{fieldTokens}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px] pt-1 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-text-primary)] font-medium">System prompt total</span>
              <span className="font-mono text-[var(--color-primary)] font-semibold">
                ~{totalSystemPrompt}
              </span>
            </div>
            {replyBudget > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--color-text-secondary)]">Max reply</span>
                <span className="font-mono text-[var(--color-text-primary)]">{replyBudget.toLocaleString()}</span>
              </div>
            )}
            {ctx > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--color-text-secondary)]">Headroom in {ctx.toLocaleString()} ctx</span>
                <span
                  className={`font-mono ${
                    headroom < 1000 ? 'text-amber-400' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {headroom.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Customize toggle */}
        <button
          type="button"
          onClick={() => setShowCustomize((o) => !o)}
          className="flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline"
        >
          {showCustomize ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Customize HYPERCODE settings
        </button>

        {showCustomize && (
          <div className="space-y-3 pt-1 border-t border-[var(--color-border)]">
            <div className="pt-3 space-y-1.5">
              <p className="text-[10px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                Tier
              </p>
              <div className="flex gap-1.5">
                <button type="button" className={tierBtnClass('core')} onClick={() => set('tier', 'core')}>
                  <span>Core</span>
                  <span className="text-[9px] opacity-80 font-mono">~{HYPERCODE_TIER_TOKEN_BASELINE.core}</span>
                </button>
                <button type="button" className={tierBtnClass('essentials')} onClick={() => set('tier', 'essentials')}>
                  <span>Essentials</span>
                  <span className="text-[9px] opacity-80 font-mono">~{HYPERCODE_TIER_TOKEN_BASELINE.essentials}</span>
                </button>
                <button type="button" className={tierBtnClass('premium')} onClick={() => set('tier', 'premium')}>
                  <span>Premium</span>
                  <span className="text-[9px] opacity-80 font-mono">~{HYPERCODE_TIER_TOKEN_BASELINE.premium}</span>
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-secondary)]/70 leading-relaxed">
                {HYPERCODE_TIER_BLURB[cfg.tier]}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MiniSelect<HypercodePOV>
                label="Perspective"
                value={cfg.pov}
                onChange={(v) => set('pov', v)}
                options={[
                  { value: 'third', label: HYPERCODE_POV_LABEL.third },
                  { value: 'second', label: HYPERCODE_POV_LABEL.second },
                  { value: 'first', label: HYPERCODE_POV_LABEL.first },
                ]}
              />
              <MiniSelect<HypercodeTense>
                label="Tense"
                value={cfg.tense}
                onChange={(v) => set('tense', v)}
                options={[
                  { value: 'past', label: HYPERCODE_TENSE_LABEL.past },
                  { value: 'present', label: HYPERCODE_TENSE_LABEL.present },
                ]}
              />
              <MiniSelect<HypercodeLength>
                label="Length"
                value={cfg.length}
                onChange={(v) => set('length', v)}
                options={[
                  { value: 'standard', label: HYPERCODE_LENGTH_LABEL.standard },
                  { value: 'compact', label: HYPERCODE_LENGTH_LABEL.compact },
                  { value: 'long', label: HYPERCODE_LENGTH_LABEL.long },
                  { value: 'adaptive', label: HYPERCODE_LENGTH_LABEL.adaptive },
                ]}
              />
              <MiniSelect<HypercodeTone>
                label="Tone"
                value={cfg.tone}
                onChange={(v) => set('tone', v)}
                options={[
                  { value: 'cinematic', label: HYPERCODE_TONE_LABEL.cinematic },
                  { value: 'literary', label: HYPERCODE_TONE_LABEL.literary },
                  { value: 'pulp', label: HYPERCODE_TONE_LABEL.pulp },
                  { value: 'minimalist', label: HYPERCODE_TONE_LABEL.minimalist },
                  { value: 'gothic', label: HYPERCODE_TONE_LABEL.gothic },
                ]}
              />
              <MiniSelect<HypercodeDialogue>
                label="Dialogue"
                value={cfg.dialogue}
                onChange={(v) => set('dialogue', v)}
                options={[
                  { value: 'standard', label: HYPERCODE_DIALOGUE_LABEL.standard },
                  { value: 'minimal', label: HYPERCODE_DIALOGUE_LABEL.minimal },
                  { value: 'prose', label: HYPERCODE_DIALOGUE_LABEL.prose },
                ]}
              />
              <MiniSelect<HypercodeMature>
                label="Mature"
                value={cfg.mature}
                onChange={(v) => set('mature', v)}
                options={[
                  { value: 'unflinching', label: HYPERCODE_MATURE_LABEL.unflinching },
                  { value: 'moderate', label: HYPERCODE_MATURE_LABEL.moderate },
                  { value: 'fade', label: HYPERCODE_MATURE_LABEL.fade },
                ]}
              />
            </div>
          </div>
        )}

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setShowPreview((o) => !o)}
          className="flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline"
        >
          {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Preview generated prompt
        </button>

        {showPreview && (
          <pre className="text-[10px] leading-relaxed text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">
            {buildHypercodePrompt(cfg)}
          </pre>
        )}

        {/* Actions */}
        <div className="space-y-1.5 pt-1">
          {/* Primary: Save & link template (mirrors sampler-link pattern) */}
          {characterAvatar && (
            <Button
              type="button"
              variant={linkedTemplateId ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleSaveAndLinkTemplate}
              disabled={!!linkedTemplateId}
              className="w-full"
            >
              {linkedTemplateId ? (
                <>
                  <Check size={14} className="mr-1.5" />
                  Linked template to {characterName ?? 'character'}
                </>
              ) : (
                <>
                  <Link2 size={14} className="mr-1.5" />
                  Save &amp; link template to {characterName ?? 'character'}
                </>
              )}
            </Button>
          )}

          {/* Secondary: write into the card's System Prompt Override */}
          {onApplyToCharacter && (
            <Button
              type="button"
              variant={characterAvatar ? 'ghost' : 'primary'}
              size="sm"
              onClick={handleSetOnCard}
              disabled={appliedToChar}
              className="w-full"
            >
              {appliedToChar ? (
                <>
                  <Check size={14} className="mr-1.5" />
                  Set on card (click Save Changes to persist)
                </>
              ) : (
                <>
                  <FileText size={14} className="mr-1.5" />
                  Set as {characterName ?? 'character'}'s System Prompt (on card)
                </>
              )}
            </Button>
          )}

          {/* Tertiary: keep around in template library, no link */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSaveTemplate}
            disabled={savedTemplate}
            className="w-full"
          >
            {savedTemplate ? (
              <>
                <Check size={14} className="mr-1.5" />
                Saved to template library
              </>
            ) : (
              'Save to template library (no link)'
            )}
          </Button>

          {characterAvatar && !linkedTemplateId && !appliedToChar && (
            <p className="text-[10px] text-[var(--color-text-secondary)] leading-snug px-1">
              <strong>Linking</strong> auto-loads this prompt when you chat with{' '}
              {characterName ?? 'this character'} and restores your default on switch-away.
              <strong> Setting on card</strong> bakes the prompt into the character file —
              portable but adds tokens to the card itself.
            </p>
          )}
        </div>

        <p className="text-[10px] text-[var(--color-text-secondary)]/50 text-center">
          HYPERCODE v1.0 by Hyperion · CC BY-NC-SA 4.0
        </p>
      </div>

      {/* Overwrite-confirm dialog — shown when "Set on card" would replace
          a non-empty existing System Prompt Override. */}
      {pendingOverwrite && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Replace existing System Prompt?
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {characterName ?? 'This character'} already has a System Prompt Override
              (~{estimateTokens(existingSystemPromptOverride ?? '')} tokens). Replacing it
              with the HYPERCODE {HYPERCODE_TIER_LABEL[cfg.tier]} prompt (~{promptTokens}{' '}
              tokens) cannot be undone from this dialog.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--color-bg-tertiary)] rounded p-2 text-[10px]">
                <p className="font-semibold text-[var(--color-text-secondary)] mb-1">Current</p>
                <p className="text-[var(--color-text-primary)] line-clamp-4 leading-snug whitespace-pre-wrap">
                  {(existingSystemPromptOverride ?? '').slice(0, 220)}
                  {(existingSystemPromptOverride ?? '').length > 220 ? '…' : ''}
                </p>
              </div>
              <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded p-2 text-[10px]">
                <p className="font-semibold text-[var(--color-primary)] mb-1">Replacement</p>
                <p className="text-[var(--color-text-primary)] line-clamp-4 leading-snug whitespace-pre-wrap">
                  {buildHypercodePrompt(cfg).slice(0, 220)}…
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPendingOverwrite(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={writeToCharacter}
                className="flex-1"
              >
                Replace
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepResults({
  answers,
  onApplyGlobal,
  onSaveAndLink,
  appliedGlobal,
  linkedTo,
  characterName,
  characterAvatar,
  onApplyToCharacterSystemPrompt,
  existingSystemPromptOverride,
  characterFieldsTokens,
  maxResponseTokens,
  contextBudget,
}: {
  answers: CompletedAnswers;
  onApplyGlobal: () => void;
  onSaveAndLink: () => void;
  appliedGlobal: boolean;
  linkedTo: string | null;
  characterName?: string;
  characterAvatar?: string;
  onApplyToCharacterSystemPrompt?: (text: string) => void;
  existingSystemPromptOverride?: string;
  characterFieldsTokens?: number;
  maxResponseTokens?: number;
  contextBudget?: number;
}) {
  const rec = buildRecommendation(answers);

  const settingRows = [
    { label: 'Temperature',        value: rec.temperature,      note: 'creativity & randomness' },
    { label: 'Max Response Tokens',value: rec.maxTokens,        note: 'response length cap' },
    { label: 'Top P',              value: rec.topP,             note: 'nucleus sampling' },
    { label: 'Min P',              value: rec.minP,             note: 'quality floor' },
    { label: 'Frequency Penalty',  value: rec.frequencyPenalty, note: 'repetition control' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg">
        <Sparkles size={16} className="text-[var(--color-primary)] shrink-0" />
        <p className="text-sm font-medium text-[var(--color-primary)]">
          Preset: {rec.presetLabel}
        </p>
      </div>

      {/* Generation settings */}
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Recommended Generation Settings
        </p>
        <div className="bg-[var(--color-bg-tertiary)] rounded-lg divide-y divide-[var(--color-border)]">
          {settingRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-[var(--color-text-primary)]">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-secondary)]">{row.note}</span>
                <span className="font-mono text-sm font-semibold text-[var(--color-primary)] min-w-[3rem] text-right">
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-2">
          {characterAvatar && (
            <Button
              type="button"
              variant={linkedTo ? 'secondary' : 'primary'}
              size="sm"
              onClick={onSaveAndLink}
              disabled={!!linkedTo}
              className="w-full"
            >
              {linkedTo ? (
                <>
                  <Check size={14} className="mr-1.5" />
                  Linked to {characterName ?? 'character'}
                </>
              ) : (
                <>
                  <Link2 size={14} className="mr-1.5" />
                  Save preset & link to {characterName ?? 'character'}
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant={characterAvatar ? 'ghost' : 'primary'}
            size="sm"
            onClick={onApplyGlobal}
            disabled={appliedGlobal}
            className="w-full"
          >
            {appliedGlobal ? (
              <>
                <Check size={14} className="mr-1.5" />
                Applied globally
              </>
            ) : characterAvatar ? (
              'Apply globally instead (no link)'
            ) : (
              'Apply Generation Settings'
            )}
          </Button>
          {characterAvatar && !linkedTo && !appliedGlobal && (
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-snug px-1">
              Linking creates a preset that auto-loads whenever you chat with this
              character, and restores your default when you switch away.
            </p>
          )}
        </div>
      </div>

      {/* Field tips */}
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Character Field Tips
        </p>
        <div className="space-y-2">
          {(Object.entries(rec.fieldTips) as [keyof typeof rec.fieldTips, string][]).map(([field, tip]) => (
            <div key={field} className="bg-[var(--color-bg-tertiary)] rounded-lg px-3 py-2.5">
              <p className="text-xs font-medium text-[var(--color-text-primary)] capitalize mb-1">
                {field === 'firstMessage' ? 'First Message' : field}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* HYPERCODE — narrative purposes only (roleplay, creative). Drops
          for assistant + companion since the framework doesn't fit. */}
      {(() => {
        const hyperConfig = inferHypercodeFromWizard(answers.purpose, answers.length);
        if (!hyperConfig) return null;
        return (
          <HypercodeSection
            initialConfig={hyperConfig}
            characterName={characterName}
            characterAvatar={characterAvatar}
            onApplyToCharacter={
              characterAvatar ? onApplyToCharacterSystemPrompt : undefined
            }
            existingSystemPromptOverride={existingSystemPromptOverride}
            characterFieldsTokens={characterFieldsTokens}
            maxResponseTokens={maxResponseTokens}
            contextBudget={contextBudget}
          />
        );
      })()}
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface CharacterSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  characterName?: string;
  characterAvatar?: string;
  /** Called when the user clicks "Set on card" in the HYPERCODE section.
   *  Receives the composed prompt text — the host should apply it to the
   *  character's systemPromptOverride form state. */
  onApplyToCharacterSystemPrompt?: (text: string) => void;
  /** The character's current systemPromptOverride. Used to detect
   *  overwrites and warn before clobbering. */
  existingSystemPromptOverride?: string;
  /** Estimated tokens used by the character's other card fields (description
   *  + personality + scenario + first message). Shown in the token budget. */
  characterFieldsTokens?: number;
}

const STEP_TITLES = [
  'What is this character for?',
  'How long should responses be?',
  'Which model tier are you using?',
  'Your Recommendations',
];

export function CharacterSetupWizard({
  isOpen,
  onClose,
  characterName,
  characterAvatar,
  onApplyToCharacterSystemPrompt,
  existingSystemPromptOverride,
  characterFieldsTokens,
}: CharacterSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({ purpose: null, length: null, tier: null });
  const [appliedGlobal, setAppliedGlobal] = useState(false);
  const [linkedPresetId, setLinkedPresetId] = useState<string | null>(null);
  const setSampler = useGenerationStore((s) => s.setSampler);
  const savePresetAndLink = useGenerationStore((s) => s.savePresetAndLink);
  const contextBudget = useGenerationStore((s) => s.context.maxTokens);

  const totalSteps = 4;
  const isComplete = answers.purpose && answers.length && answers.tier;

  const handleBack = () => {
    if (step === 0) return onClose();
    setStep((s) => s - 1);
  };

  const handleNext = () => {
    setStep((s) => s + 1);
  };

  const canAdvance = [
    !!answers.purpose,
    !!answers.length,
    !!answers.tier,
    true,
  ][step];

  const applyRecommendedSampler = (rec: ReturnType<typeof buildRecommendation>) => {
    setSampler({
      temperature: rec.temperature,
      maxTokens: rec.maxTokens,
      topP: rec.topP,
      minP: rec.minP,
      frequencyPenalty: rec.frequencyPenalty,
    });
  };

  const handleApplyGlobal = () => {
    if (!isComplete) return;
    const rec = buildRecommendation(answers as CompletedAnswers);
    applyRecommendedSampler(rec);
    setAppliedGlobal(true);
  };

  const handleSaveAndLink = () => {
    if (!isComplete || !characterAvatar) return;
    const rec = buildRecommendation(answers as CompletedAnswers);
    applyRecommendedSampler(rec);
    // Defer to next tick so setSampler's persisted state is observable when
    // savePresetAndLink reads `sampler` from the store.
    queueMicrotask(() => {
      const id = savePresetAndLink(rec.presetLabel, characterAvatar);
      setLinkedPresetId(id);
    });
  };

  const handleClose = () => {
    setStep(0);
    setAnswers({ purpose: null, length: null, tier: null });
    setAppliedGlobal(false);
    setLinkedPresetId(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        characterName
          ? `Setup Wizard — ${characterName}`
          : 'Character Setup Wizard'
      }
      size="md"
    >
      {/* Progress bar */}
      <div className="flex gap-1 mb-5 -mt-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
            }`}
          />
        ))}
      </div>

      {/* Step header */}
      <div className="flex items-center gap-2 mb-4">
        <Wand2 size={16} className="text-[var(--color-primary)] shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {STEP_TITLES[step]}
        </h3>
        <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
          {step + 1} / {totalSteps}
        </span>
      </div>

      {/* Step content */}
      <div className="min-h-[240px]">
        {step === 0 && (
          <StepPurpose value={answers.purpose} onChange={(v) => setAnswers((a) => ({ ...a, purpose: v }))} />
        )}
        {step === 1 && (
          <StepLength value={answers.length} onChange={(v) => setAnswers((a) => ({ ...a, length: v }))} />
        )}
        {step === 2 && (
          <StepModelTier value={answers.tier} onChange={(v) => setAnswers((a) => ({ ...a, tier: v }))} />
        )}
        {step === 3 && isComplete && (
          <StepResults
            answers={answers as CompletedAnswers}
            onApplyGlobal={handleApplyGlobal}
            onSaveAndLink={handleSaveAndLink}
            appliedGlobal={appliedGlobal}
            linkedTo={linkedPresetId}
            characterName={characterName}
            characterAvatar={characterAvatar}
            onApplyToCharacterSystemPrompt={onApplyToCharacterSystemPrompt}
            existingSystemPromptOverride={existingSystemPromptOverride}
            characterFieldsTokens={characterFieldsTokens}
            maxResponseTokens={
              buildRecommendation(answers as CompletedAnswers).maxTokens
            }
            contextBudget={contextBudget}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex gap-2 mt-5 pt-4 border-t border-[var(--color-border)]">
        <Button type="button" variant="secondary" size="sm" onClick={handleBack} className="flex-1">
          <ArrowLeft size={14} className="mr-1" />
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {step < totalSteps - 1 ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex-1"
          >
            Next
            <ArrowRight size={14} className="ml-1" />
          </Button>
        ) : (
          <Button type="button" variant="primary" size="sm" onClick={handleClose} className="flex-1">
            Done
          </Button>
        )}
      </div>
    </Modal>
  );
}
