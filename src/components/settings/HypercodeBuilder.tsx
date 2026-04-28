/**
 * HYPERCODE Builder — composes a HYPERCODE v1.0 system prompt from a tier
 * selection + six style dimensions, then saves it as a prompt template.
 *
 * HYPERCODE by Hyperion · CC BY-NC-SA 4.0
 * https://github.com/hype-hosting/HYPERCODE
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { Button } from '../ui';
import {
  buildHypercodePrompt,
  buildHypercodeName,
  HYPERCODE_DEFAULTS,
  HYPERCODE_TIER_BLURB,
  HYPERCODE_LENGTH_LABEL,
  HYPERCODE_POV_LABEL,
  HYPERCODE_TENSE_LABEL,
  HYPERCODE_TONE_LABEL,
  HYPERCODE_DIALOGUE_LABEL,
  HYPERCODE_MATURE_LABEL,
  type HypercodeConfig,
  type HypercodeTier,
} from '../../utils/hypercode';

function Select<T extends string>({
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
      <label className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
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

export function HypercodeBuilder() {
  const { saveTemplateWithPrompt } = usePromptTemplateStore();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<HypercodeConfig>({ ...HYPERCODE_DEFAULTS });
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof HypercodeConfig>(key: K, val: HypercodeConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: val }));

  const effectiveName = name.trim() || buildHypercodeName(cfg);

  const handleSave = () => {
    saveTemplateWithPrompt(effectiveName, buildHypercodePrompt(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tierBtnClass = (t: HypercodeTier) =>
    `flex-1 py-1.5 text-xs rounded-md border transition-colors ${
      cfg.tier === t
        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white font-semibold'
        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/60'
    }`;

  return (
    <section className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
      >
        <Sparkles size={16} className="text-[var(--color-primary)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            HYPERCODE Builder
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Compose a HYPERCODE v1.0 system prompt and save it as a template
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-[var(--color-text-secondary)] flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-[var(--color-text-secondary)] flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--color-border)]">
          {/* Tier */}
          <div className="pt-3 space-y-1.5">
            <p className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Tier
            </p>
            <div className="flex gap-2">
              <button type="button" className={tierBtnClass('core')} onClick={() => set('tier', 'core')}>
                Core
              </button>
              <button type="button" className={tierBtnClass('essentials')} onClick={() => set('tier', 'essentials')}>
                Essentials
              </button>
              <button type="button" className={tierBtnClass('premium')} onClick={() => set('tier', 'premium')}>
                Premium
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]/70 leading-relaxed">
              {HYPERCODE_TIER_BLURB[cfg.tier]}
            </p>
          </div>

          {/* Style dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Perspective"
              value={cfg.pov}
              onChange={(v) => set('pov', v)}
              options={[
                { value: 'third', label: HYPERCODE_POV_LABEL.third },
                { value: 'second', label: HYPERCODE_POV_LABEL.second },
                { value: 'first', label: HYPERCODE_POV_LABEL.first },
              ]}
            />
            <Select
              label="Tense"
              value={cfg.tense}
              onChange={(v) => set('tense', v)}
              options={[
                { value: 'past', label: HYPERCODE_TENSE_LABEL.past },
                { value: 'present', label: HYPERCODE_TENSE_LABEL.present },
              ]}
            />
            <Select
              label="Response Length"
              value={cfg.length}
              onChange={(v) => set('length', v)}
              options={[
                { value: 'standard', label: HYPERCODE_LENGTH_LABEL.standard },
                { value: 'compact', label: HYPERCODE_LENGTH_LABEL.compact },
                { value: 'long', label: HYPERCODE_LENGTH_LABEL.long },
                { value: 'adaptive', label: HYPERCODE_LENGTH_LABEL.adaptive },
              ]}
            />
            <Select
              label="Prose Tone"
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
            <Select
              label="Dialogue Style"
              value={cfg.dialogue}
              onChange={(v) => set('dialogue', v)}
              options={[
                { value: 'standard', label: HYPERCODE_DIALOGUE_LABEL.standard },
                { value: 'minimal', label: HYPERCODE_DIALOGUE_LABEL.minimal },
                { value: 'prose', label: HYPERCODE_DIALOGUE_LABEL.prose },
              ]}
            />
            <Select
              label="Mature Content"
              value={cfg.mature}
              onChange={(v) => set('mature', v)}
              options={[
                { value: 'unflinching', label: HYPERCODE_MATURE_LABEL.unflinching },
                { value: 'moderate', label: HYPERCODE_MATURE_LABEL.moderate },
                { value: 'fade', label: HYPERCODE_MATURE_LABEL.fade },
              ]}
            />
          </div>

          {/* Template name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={buildHypercodeName(cfg)}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Save button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            className="w-full"
          >
            {saved ? '✓ Saved as template' : 'Save as Template'}
          </Button>

          {/* Attribution */}
          <p className="text-[10px] text-[var(--color-text-secondary)]/50 text-center">
            HYPERCODE v1.0 by Hyperion · CC BY-NC-SA 4.0
          </p>
        </div>
      )}
    </section>
  );
}
