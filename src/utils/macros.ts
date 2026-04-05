// Macro processor for prompt substitution
// Supports core ST-style macros like {{char}}, {{user}}, {{time}}, {{random}}, etc.

export interface MacroContext {
  charName?: string;
  userName?: string;
  personaName?: string;
  personaDescription?: string;
  characterDescription?: string;
  characterPersonality?: string;
  characterScenario?: string;
  lastMessage?: string;
  lastUserMessage?: string;
  lastCharMessage?: string;
  model?: string;
  maxPrompt?: number;
  // Arbitrary additional values
  extra?: Record<string, string>;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function getTimeString(): string {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

function getDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function getWeekdayString(): string {
  return WEEKDAYS[new Date().getDay()];
}

function getMonthString(): string {
  return MONTHS[new Date().getMonth()];
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

// Parse "a::b::c" or "a,b,c" or "a|b|c" style separators within macro args
function splitArgs(raw: string): string[] {
  if (raw.includes('::')) return raw.split('::').map((s) => s.trim());
  if (raw.includes('|')) return raw.split('|').map((s) => s.trim());
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim());
  return [raw.trim()];
}

/**
 * Process macros in the given text using the supplied context.
 * Replaces {{macro}} and {{macro:args}} patterns.
 * Returns a new string; original is not mutated.
 */
export function processMacros(text: string, ctx: MacroContext): string {
  if (!text) return text;

  // Replace macros in a single pass using a regex with a callback.
  // Pattern matches {{name}} and {{name:args}} (args may contain non-brace chars).
  return text.replace(/\{\{([^{}]+?)\}\}/g, (match, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return match;

    // Split on first ':' for name:args form
    const colonIdx = trimmed.indexOf(':');
    const name =
      colonIdx >= 0 ? trimmed.slice(0, colonIdx).trim().toLowerCase() : trimmed.toLowerCase();
    const args = colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : '';

    switch (name) {
      case 'char':
      case 'character':
        return ctx.charName || '';
      case 'user':
        return ctx.userName || ctx.personaName || 'User';
      case 'persona':
        return ctx.personaDescription || '';
      case 'description':
        return ctx.characterDescription || '';
      case 'personality':
        return ctx.characterPersonality || '';
      case 'scenario':
        return ctx.characterScenario || '';
      case 'lastmessage':
      case 'last_message':
        return ctx.lastMessage || '';
      case 'lastusermessage':
      case 'last_user_message':
        return ctx.lastUserMessage || '';
      case 'lastcharmessage':
      case 'last_char_message':
        return ctx.lastCharMessage || '';
      case 'model':
        return ctx.model || '';
      case 'maxprompt':
      case 'max_prompt':
        return ctx.maxPrompt ? String(ctx.maxPrompt) : '';
      case 'time':
        return getTimeString();
      case 'date':
        return getDateString();
      case 'weekday':
      case 'day':
        return getWeekdayString();
      case 'month':
        return getMonthString();
      case 'isodate':
      case 'iso_date':
        return new Date().toISOString();
      case 'datetimeformat':
      case 'datetime':
        return new Date().toLocaleString();
      case 'random': {
        // {{random:a,b,c}} => pick one; {{random}} => 0..1 number
        if (!args) return String(Math.random());
        const options = splitArgs(args);
        return pickRandom(options) ?? '';
      }
      case 'pick': {
        // {{pick:a,b,c}} => stable pick (seeded by text hash) - fallback to random
        if (!args) return '';
        return pickRandom(splitArgs(args)) ?? '';
      }
      case 'roll': {
        // {{roll:d6}} => 1..6
        if (!args) return '';
        const m = args.match(/d(\d+)/i);
        if (!m) return '';
        const sides = parseInt(m[1], 10);
        if (!sides || sides < 1) return '';
        return String(1 + Math.floor(Math.random() * sides));
      }
      case 'newline':
        return '\n';
      case 'noop':
      case 'comment':
        return '';
      case 'extra': {
        // {{extra:key}} from extra map
        if (!args || !ctx.extra) return '';
        return ctx.extra[args.trim()] || '';
      }
      default:
        // Unknown macro – leave original text
        return match;
    }
  });
}

/**
 * Scan for any unrecognized macro-looking patterns after processing.
 * Useful for debugging/UI.
 */
export function findUnresolvedMacros(text: string): string[] {
  const found: string[] = [];
  const re = /\{\{([^{}]+?)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.push(m[1].trim());
  }
  return found;
}
