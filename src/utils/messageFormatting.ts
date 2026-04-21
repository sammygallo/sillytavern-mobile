// Display-time message formatting normalizer. Non-destructive — transforms
// what MarkdownContent renders, never what's stored. Complements the
// existing RP parser (which styles *actions* / _actions_ / {{thoughts}}).
//
// Two passes:
//   normalizeForDisplay() — text cleanups that apply everywhere: curly →
//     straight double quotes, typewriter `--` → em dash.
//   wrapDialogue() — wraps simple "…" spans in <span class="dialogue"> so
//     themes can style speech distinctly. Applied to dialogue segments only,
//     after the RP parser has extracted actions/thoughts.

/**
 * Pure text cleanups that don't inject HTML. Safe to run on any segment.
 */
export function normalizeForDisplay(text: string): string {
  if (!text) return text;
  let out = text;
  // Curly double quotes → straight. Leave single quotes alone — apostrophe
  // ambiguity (don't, it's) makes automated conversion unsafe.
  out = out.replace(/[\u201C\u201D]/g, '"');
  // Typewriter double-dash with surrounding spaces → em dash.
  out = out.replace(/(\S)\s--\s(\S)/g, '$1 \u2014 $2');
  return out;
}

/**
 * Wrap simple single-line "…" segments in a dialogue span so themes can
 * style them. Designed to run on content that will subsequently be parsed
 * by `marked`, which preserves inline HTML.
 *
 * Deliberately conservative: only wraps pairs that sit on one line and
 * contain no newlines. Multi-line dialogue (rare) falls through untouched.
 * Escapes existing `<` in the matched segment so we never create partial
 * tags — any HTML already inside the quotes is preserved as literal text.
 */
export function wrapDialogue(text: string): string {
  if (!text) return text;
  // Match "…" where the interior has no newline or another " — no nested
  // quotes, no multi-line strings. Matches greedily within a single line.
  return text.replace(/"([^"\n]+)"/g, (_m, inner: string) => {
    return `<span class="dialogue">"${inner}"</span>`;
  });
}
