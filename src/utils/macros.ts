// Macro processor for prompt substitution
// Supports core ST-style macros ({{char}}, {{user}}, {{time}}, {{random}}, …)
// plus Phase 9.3 extensions: {{if}}/{{else}}/{{/if}} conditionals,
// {{getvar}}/{{setvar}}/{{addvar}}/{{incvar}}/{{decvar}} chat-scoped variables,
// {{calc}} safe arithmetic, {{isMobile}}, {{mesExamples}}.

export interface MacroContext {
  charName?: string;
  userName?: string;
  personaName?: string;
  personaDescription?: string;
  characterDescription?: string;
  characterPersonality?: string;
  characterScenario?: string;
  characterExampleMessages?: string;
  lastMessage?: string;
  lastUserMessage?: string;
  lastCharMessage?: string;
  model?: string;
  maxPrompt?: number;
  /**
   * Phase 9.3: mutable map of chat-scoped variables. `setvar` mutates this
   * map in place; the caller is responsible for persisting it back to storage
   * after macro processing completes.
   */
  variables?: Record<string, string>;
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

// ───────── Phase 9.3: Safe arithmetic evaluator ─────────
//
// Recursive-descent parser for the grammar:
//   expression := term (('+' | '-') term)*
//   term       := factor (('*' | '/' | '%') factor)*
//   factor     := number | '(' expression ')' | ('-' | '+') factor
//
// No `eval`, no `Function`. Unknown characters return an empty string.

class CalcParser {
  readonly text: string;
  pos = 0;
  constructor(text: string) {
    this.text = text;
  }
  peek(): string {
    return this.text[this.pos] ?? '';
  }
  consume(ch: string): boolean {
    if (this.peek() === ch) {
      this.pos++;
      return true;
    }
    return false;
  }
  parseExpression(): number {
    let left = this.parseTerm();
    while (this.pos < this.text.length) {
      const op = this.peek();
      if (op !== '+' && op !== '-') break;
      this.pos++;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  parseTerm(): number {
    let left = this.parseFactor();
    while (this.pos < this.text.length) {
      const op = this.peek();
      if (op !== '*' && op !== '/' && op !== '%') break;
      this.pos++;
      const right = this.parseFactor();
      if (op === '*') left = left * right;
      else if (op === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  }
  parseFactor(): number {
    if (this.consume('-')) return -this.parseFactor();
    if (this.consume('+')) return this.parseFactor();
    if (this.consume('(')) {
      const v = this.parseExpression();
      if (!this.consume(')')) throw new Error('unmatched paren');
      return v;
    }
    const start = this.pos;
    while (this.pos < this.text.length && /[\d.]/.test(this.text[this.pos])) {
      this.pos++;
    }
    if (this.pos === start) throw new Error('expected number');
    const num = Number(this.text.slice(start, this.pos));
    if (Number.isNaN(num)) throw new Error('invalid number');
    return num;
  }
}

function evalCalc(expr: string): string {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return '';
  if (!/^[-+*/%().\d]+$/.test(cleaned)) return '';
  try {
    const parser = new CalcParser(cleaned);
    const result = parser.parseExpression();
    if (parser.pos !== cleaned.length) return '';
    if (!Number.isFinite(result)) return '';
    return String(result);
  } catch {
    return '';
  }
}

// ───────── Phase 9.3: Conditional block parser ─────────

const IF_OPEN = '{{if::';
const IF_CLOSE = '{{/if}}';
const ELSE_TAG = '{{else}}';

function numCompare(a: string, b: string, fn: (x: number, y: number) => boolean): boolean {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  return fn(x, y);
}

/**
 * Evaluate a condition string. Supports: contains, ==, !=, <=, >=, <, >.
 * Operands are trimmed. Numeric operators parse both sides as numbers; if
 * either fails to parse, the comparison is false. An operator-less condition
 * is truthy iff the trimmed string is non-empty.
 */
function evaluateCondition(cond: string): boolean {
  const trimmed = cond.trim();
  if (!trimmed) return false;
  const patterns: { re: RegExp; fn: (a: string, b: string) => boolean }[] = [
    { re: /^(.*?)\s+contains\s+(.*)$/, fn: (a, b) => a.includes(b) },
    { re: /^(.*?)==(.*)$/, fn: (a, b) => a === b },
    { re: /^(.*?)!=(.*)$/, fn: (a, b) => a !== b },
    { re: /^(.*?)<=(.*)$/, fn: (a, b) => numCompare(a, b, (x, y) => x <= y) },
    { re: /^(.*?)>=(.*)$/, fn: (a, b) => numCompare(a, b, (x, y) => x >= y) },
    { re: /^(.*?)<(.*)$/, fn: (a, b) => numCompare(a, b, (x, y) => x < y) },
    { re: /^(.*?)>(.*)$/, fn: (a, b) => numCompare(a, b, (x, y) => x > y) },
  ];
  for (const { re, fn } of patterns) {
    const m = trimmed.match(re);
    if (m) return fn(m[1].trim(), m[2].trim());
  }
  return Boolean(trimmed);
}

/**
 * Walk `text` looking for `{{if::…}}…{{/if}}` blocks and replace each with
 * the selected branch. Nested `{{if::}}` blocks are tracked via a depth
 * counter. The condition is itself run through `processInline` first so
 * nested macros resolve before comparison.
 */
function processBlocks(text: string, ctx: MacroContext): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const openIdx = text.indexOf(IF_OPEN, i);
    if (openIdx === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, openIdx);

    // Find the `}}` that closes the {{if::...}} opener, tracking nested {{ }}.
    const condStart = openIdx + IF_OPEN.length;
    let condEnd = -1;
    let braceDepth = 1;
    let k = condStart;
    while (k < text.length - 1) {
      if (text[k] === '{' && text[k + 1] === '{') {
        braceDepth++;
        k += 2;
      } else if (text[k] === '}' && text[k + 1] === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          condEnd = k;
          break;
        }
        k += 2;
      } else {
        k++;
      }
    }
    if (condEnd === -1) {
      // Unclosed {{if}} — bail out and keep the rest of the text as-is.
      result += text.slice(openIdx);
      break;
    }
    const condition = text.slice(condStart, condEnd);
    const bodyStart = condEnd + 2;

    // Find the matching {{/if}} respecting nested {{if::...}} blocks.
    // Track {{else}} at depth 1 (the block we're currently matching).
    let depth = 1;
    let bodyEnd = -1;
    let elseIdx = -1;
    let j = bodyStart;
    while (j < text.length) {
      if (text.startsWith(IF_OPEN, j)) {
        depth++;
        j += IF_OPEN.length;
      } else if (text.startsWith(IF_CLOSE, j)) {
        depth--;
        if (depth === 0) {
          bodyEnd = j;
          break;
        }
        j += IF_CLOSE.length;
      } else if (depth === 1 && text.startsWith(ELSE_TAG, j)) {
        if (elseIdx === -1) elseIdx = j;
        j += ELSE_TAG.length;
      } else {
        j++;
      }
    }
    if (bodyEnd === -1) {
      result += text.slice(openIdx);
      break;
    }

    const thenBranch =
      elseIdx !== -1 ? text.slice(bodyStart, elseIdx) : text.slice(bodyStart, bodyEnd);
    const elseBranch =
      elseIdx !== -1 ? text.slice(elseIdx + ELSE_TAG.length, bodyEnd) : '';

    // Resolve macros inside the condition so e.g. `{{getvar::x}}==5` works.
    const resolvedCond = processInline(condition, ctx);
    const taken = evaluateCondition(resolvedCond) ? thenBranch : elseBranch;
    result += taken;

    i = bodyEnd + IF_CLOSE.length;
  }

  return result;
}

// ───────── Inline (single-brace) substitution ─────────

/**
 * Single-pass replacement of `{{name}}` / `{{name:args}}` / `{{name::args}}`.
 * The regex excludes braces inside the match, so inside-out processing falls
 * out naturally: innermost macros (which have no nested braces) get resolved
 * first, the next iteration of the outer loop sees the updated text.
 */
function processInline(text: string, ctx: MacroContext): string {
  if (!text) return text;
  return text.replace(/\{\{([^{}]+?)\}\}/g, (match, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return match;

    // Split on first `::` (Phase 9.3 macros) or fall back to `:` (legacy).
    let sepIdx = trimmed.indexOf('::');
    let sepLen = 2;
    if (sepIdx < 0) {
      sepIdx = trimmed.indexOf(':');
      sepLen = 1;
    }
    const name =
      sepIdx >= 0 ? trimmed.slice(0, sepIdx).trim().toLowerCase() : trimmed.toLowerCase();
    const args = sepIdx >= 0 ? trimmed.slice(sepIdx + sepLen) : '';

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
      case 'mesexamples':
      case 'mes_examples':
      case 'mesexample':
        return ctx.characterExampleMessages || '';
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
      case 'ismobile':
      case 'is_mobile':
        return 'true';
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
        if (!args) return String(Math.random());
        const options = splitArgs(args);
        return pickRandom(options) ?? '';
      }
      case 'pick': {
        if (!args) return '';
        return pickRandom(splitArgs(args)) ?? '';
      }
      case 'roll': {
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
        if (!args || !ctx.extra) return '';
        return ctx.extra[args.trim()] || '';
      }

      // ───── Phase 9.3: Variables ─────
      case 'getvar': {
        const key = args.trim();
        if (!key) return '';
        return ctx.variables?.[key] ?? '';
      }
      case 'setvar': {
        const parts = args.split('::');
        if (parts.length < 2) return '';
        const key = parts[0].trim();
        if (!key) return '';
        const value = parts.slice(1).join('::');
        if (ctx.variables) ctx.variables[key] = value;
        return '';
      }
      case 'addvar': {
        const parts = args.split('::');
        if (parts.length < 2) return '';
        const key = parts[0].trim();
        if (!key) return '';
        const delta = Number(parts.slice(1).join('::'));
        if (Number.isNaN(delta)) return '';
        const current = Number(ctx.variables?.[key] ?? 0);
        const base = Number.isFinite(current) ? current : 0;
        const next = String(base + delta);
        if (ctx.variables) ctx.variables[key] = next;
        return '';
      }
      case 'incvar':
      case 'decvar': {
        const key = args.trim();
        if (!key) return '';
        const current = Number(ctx.variables?.[key] ?? 0);
        const base = Number.isFinite(current) ? current : 0;
        const next = String(base + (name === 'incvar' ? 1 : -1));
        if (ctx.variables) ctx.variables[key] = next;
        return next;
      }

      // ───── Phase 9.3: Math ─────
      case 'calc': {
        if (!args) return '';
        return evalCalc(args);
      }

      default:
        // Unknown macro – leave original text so it's visible for debugging.
        return match;
    }
  });
}

/**
 * Process macros in the given text using the supplied context.
 *
 * Runs block (`{{if}}`) and inline passes in a loop until the text stabilizes,
 * capped at 5 iterations so a pathological input can't spin forever. This lets
 * nested macros like `{{calc::{{getvar::x}}*2}}` resolve inside-out.
 *
 * Returns a new string; the original is not mutated. `ctx.variables`, if
 * provided, IS mutated in place — the caller is responsible for persisting.
 */
export function processMacros(text: string, ctx: MacroContext): string {
  if (!text) return text;
  let current = text;
  for (let i = 0; i < 5; i++) {
    const afterBlocks = processBlocks(current, ctx);
    const afterInline = processInline(afterBlocks, ctx);
    if (afterInline === current) break;
    current = afterInline;
  }
  return current;
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
