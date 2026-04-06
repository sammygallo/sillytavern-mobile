import type { RegexScript } from '../stores/regexScriptStore';

/** Compile a RegexScript's pattern + flags into a RegExp.
 *  Returns null if the pattern is invalid. */
function compileRegex(script: RegexScript): RegExp | null {
  try {
    return new RegExp(script.pattern, script.flags);
  } catch {
    return null;
  }
}

/** Apply an ordered list of regex scripts to text sequentially.
 *  Invalid patterns are silently skipped. */
export function applyRegexScripts(text: string, scripts: RegexScript[]): string {
  let result = text;
  for (const script of scripts) {
    const re = compileRegex(script);
    if (!re) continue;
    try {
      result = result.replace(re, script.replacement);
    } catch {
      // skip on replacement error (e.g. bad group reference)
    }
  }
  return result;
}

/** Get enabled scripts matching the given scope and character, sorted by order.
 *  @param characterAvatar — current character's avatar; undefined for system/user-only contexts
 *  @param scope — which pipeline stage is requesting scripts */
export function getActiveScripts(
  scripts: RegexScript[],
  characterAvatar: string | undefined,
  scope: 'ai_output' | 'user_input'
): RegexScript[] {
  return scripts
    .filter((s) => {
      if (!s.enabled) return false;
      if (!s.pattern.trim()) return false;
      // Scope match: 'both' matches either side
      if (s.scope !== 'both' && s.scope !== scope) return false;
      // Character scope: empty = global
      if (s.characterScope.length > 0 && characterAvatar) {
        if (!s.characterScope.includes(characterAvatar)) return false;
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);
}
