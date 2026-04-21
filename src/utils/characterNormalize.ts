// Character import normalizer — runs after parse, before cardToCharacterInfo.
// Layer 1 (always on): strip junk whitespace, dedup tags, flag missing fields.
// Layer 2 (opt-in): standardize formatting conventions (quotes, italics).

import type { CharacterCardV2, CharacterExportData } from './characterCard';

export interface NormalizeOptions {
  standardizeFormatting: boolean;
}

export interface NormalizationResult<T> {
  card: T;
  warnings: string[];
  changes: string[];
}

type CardData = CharacterCardV2['data'] | CharacterExportData;

const TEXT_FIELDS: Array<keyof CardData> = [
  'description',
  'personality',
  'first_mes',
  'scenario',
  'mes_example',
  'creator_notes',
  'system_prompt',
  'post_history_instructions',
];

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

function standardizeFormatting(s: string): string {
  let out = s;
  // Curly double quotes → straight. Leave single quotes alone — apostrophe
  // collisions ("don't", "it's") make automated conversion unsafe.
  out = out.replace(/[\u201C\u201D]/g, '"');
  // Underscore italics `_word_` → asterisk italics `*word*`, at word boundaries,
  // to avoid touching snake_case, URLs, or inline code.
  out = out.replace(/(^|[^\w_])_([^\n_][^\n_]*?)_(?=[^\w_]|$)/g, '$1*$2*');
  // Triple-asterisk (bold-italic) → single asterisks.
  out = out.replace(/\*{3,}([^*\n]+?)\*{3,}/g, '*$1*');
  // Typewriter double-dash → em dash.
  out = out.replace(/(\S)\s--\s(\S)/g, '$1 \u2014 $2');
  return out;
}

function stripStrayStartMarker(s: string): string {
  return s
    .replace(/^\s*<START>\s*\n?/i, '')
    .replace(/\n?\s*<START>\s*$/i, '');
}

function normalizeTags(tags: unknown): { tags: string[]; removed: number } {
  if (!Array.isArray(tags)) return { tags: [], removed: 0 };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return { tags: out, removed: (tags.length || 0) - out.length };
}

function collectWarnings(data: Partial<CardData>): string[] {
  const warnings: string[] = [];
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description =
    typeof data.description === 'string' ? data.description.trim() : '';
  const personality =
    typeof data.personality === 'string' ? data.personality.trim() : '';
  const firstMes =
    typeof data.first_mes === 'string' ? data.first_mes.trim() : '';
  const mesExample =
    typeof data.mes_example === 'string' ? data.mes_example.trim() : '';

  if (!name) warnings.push('Character has no name');
  if (!description && !personality) {
    warnings.push(
      'Description and personality are both empty — the AI will struggle to play this character'
    );
  }
  if (!firstMes) warnings.push('First message is empty');
  if (!mesExample && !personality) {
    warnings.push(
      'No example messages or personality — consider adding some for better response quality'
    );
  }
  return warnings;
}

function isV2(
  card: CharacterCardV2 | CharacterExportData
): card is CharacterCardV2 {
  return (
    'spec' in card &&
    (card.spec === 'chara_card_v2' || card.spec === 'chara_card_v3')
  );
}

export function normalizeCard<
  T extends CharacterCardV2 | CharacterExportData,
>(card: T, options: NormalizeOptions): NormalizationResult<T> {
  const changes: string[] = [];
  const src: CardData = isV2(card) ? card.data : (card as CharacterExportData);
  const out: Record<string, unknown> = { ...src };

  if (typeof src.name === 'string') {
    const trimmedName = src.name.trim();
    if (trimmedName !== src.name) out.name = trimmedName;
  }

  let whitespaceTouched = 0;
  let formattingTouched = 0;

  for (const field of TEXT_FIELDS) {
    const original = src[field];
    if (typeof original !== 'string' || !original) continue;

    const afterWhitespace = normalizeWhitespace(original);
    const afterFormatting = options.standardizeFormatting
      ? standardizeFormatting(afterWhitespace)
      : afterWhitespace;

    if (afterFormatting === original) continue;
    out[field as string] = afterFormatting;

    if (afterWhitespace !== original) whitespaceTouched++;
    if (afterFormatting !== afterWhitespace) formattingTouched++;
  }

  if (typeof out.first_mes === 'string') {
    const before = out.first_mes;
    const stripped = stripStrayStartMarker(before);
    if (stripped !== before) {
      out.first_mes = stripped;
      changes.push('Removed stray <START> marker from first message');
    }
  }

  if (Array.isArray(out.alternate_greetings)) {
    const normalized = (out.alternate_greetings as unknown[]).map((g) => {
      if (typeof g !== 'string') return g;
      const cleaned = normalizeWhitespace(g);
      return options.standardizeFormatting
        ? standardizeFormatting(cleaned)
        : cleaned;
    });
    out.alternate_greetings = normalized;
  }

  const { tags: cleanedTags, removed: tagsRemoved } = normalizeTags(
    (src as { tags?: unknown }).tags
  );
  out.tags = cleanedTags;
  if (tagsRemoved > 0) {
    changes.push(
      `Deduped / cleaned ${tagsRemoved} tag${tagsRemoved === 1 ? '' : 's'}`
    );
  }

  if (whitespaceTouched > 0) {
    changes.push(
      `Cleaned whitespace on ${whitespaceTouched} field${whitespaceTouched === 1 ? '' : 's'}`
    );
  }
  if (formattingTouched > 0) {
    changes.push(
      `Normalized formatting on ${formattingTouched} field${formattingTouched === 1 ? '' : 's'}`
    );
  }

  const warnings = collectWarnings(out as Partial<CardData>);

  const result = isV2(card)
    ? ({ ...card, data: out as CharacterCardV2['data'] } as T)
    : (out as T);

  return { card: result, warnings, changes };
}
