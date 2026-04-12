// STscript parser — tokenizes raw input into a pipeline of commands,
// handling pipes (|), double-pipes (||), closures ({: :}), quoted strings,
// and named/unnamed arguments.

import type { ParsedArg, ParsedCommand, ParsedPipeline } from './types';

// ───── Phase A: Split on pipes ─────

interface PipeSegment {
  text: string;
  breakPipe: boolean;  // preceded by ||
}

/**
 * Walk the input char-by-char, splitting on | while respecting:
 * - Closure delimiters {: and :} (track nesting depth)
 * - Quoted strings "..." (no split inside)
 * - Escaped pipe \| (literal, no split)
 * - Double-pipe || (break-pipe marker)
 */
function splitPipeline(input: string): PipeSegment[] {
  const segments: PipeSegment[] = [];
  let current = '';
  let closureDepth = 0;
  let inQuote = false;
  let breakPipe = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    // Escape: \| or \" etc.
    if (ch === '\\' && i + 1 < input.length) {
      current += ch + next;
      i++;
      continue;
    }

    // Quoted strings
    if (ch === '"' && closureDepth === 0) {
      inQuote = !inQuote;
      current += ch;
      continue;
    }

    if (inQuote) {
      current += ch;
      continue;
    }

    // Closure open: {:
    if (ch === '{' && next === ':') {
      closureDepth++;
      current += '{:';
      i++;
      continue;
    }

    // Closure close: :}
    if (ch === ':' && next === '}' && closureDepth > 0) {
      closureDepth--;
      current += ':}';
      i++;
      continue;
    }

    // Pipe (only at top level, not inside closures)
    if (ch === '|' && closureDepth === 0) {
      // Double pipe?
      if (next === '|') {
        segments.push({ text: current, breakPipe });
        current = '';
        breakPipe = true;
        i++; // skip second |
        continue;
      }
      segments.push({ text: current, breakPipe });
      current = '';
      breakPipe = false;
      continue;
    }

    current += ch;
  }

  // Last segment
  if (current.trim()) {
    segments.push({ text: current, breakPipe });
  }

  return segments;
}

// ───── Phase B: Parse a single command segment ─────

/**
 * Parse arguments from the text after the command name.
 * Handles: key=value, key="quoted value", bare tokens, closure {: ... :} literals.
 */
function parseArgs(text: string): ParsedArg[] {
  const args: ParsedArg[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip whitespace
    if (text[i] === ' ' || text[i] === '\t') {
      i++;
      continue;
    }

    // Closure literal {: ... :}
    if (text[i] === '{' && text[i + 1] === ':') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '{' && text[j + 1] === ':') { depth++; j += 2; continue; }
        if (text[j] === ':' && text[j + 1] === '}') { depth--; j += 2; continue; }
        j++;
      }
      args.push({ value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Quoted string
    if (text[i] === '"') {
      let j = i + 1;
      let val = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) {
          val += text[j + 1];
          j += 2;
          continue;
        }
        val += text[j];
        j++;
      }
      if (j < text.length) j++; // skip closing quote

      // Check if this was part of a key="value" pattern
      // Look back to see if there's a key= preceding
      if (args.length > 0) {
        const last = args[args.length - 1];
        if (last.key !== undefined && last.value === '') {
          last.value = val;
          i = j;
          continue;
        }
      }
      args.push({ value: val });
      i = j;
      continue;
    }

    // Token (bare word, possibly key=value)
    let j = i;
    while (j < text.length && text[j] !== ' ' && text[j] !== '\t') {
      // Don't break on = inside quoted values
      if (text[j] === '"') {
        // jump to end of quote
        j++;
        while (j < text.length && text[j] !== '"') {
          if (text[j] === '\\') j++;
          j++;
        }
        if (j < text.length) j++; // skip closing "
        continue;
      }
      if (text[j] === '{' && text[j + 1] === ':') break; // closure starts, separate token
      j++;
    }

    const token = text.slice(i, j);
    i = j;

    // Check for key=value
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.slice(0, eqIdx);
      let value = token.slice(eqIdx + 1);
      // Strip surrounding quotes from value if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      args.push({ key, value });
    } else {
      args.push({ value: token });
    }
  }

  return args;
}

/**
 * Parse a single pipe segment into a ParsedCommand.
 * If the segment doesn't start with /, treat it as /pass.
 */
function parseCommand(segment: string, breakPipe: boolean): ParsedCommand {
  const trimmed = segment.trim();

  if (!trimmed.startsWith('/')) {
    // Bare text segment in pipeline → treat as /pass
    return {
      name: 'pass',
      args: [{ value: trimmed }],
      rawArgs: trimmed,
      breakPipe,
    };
  }

  // Find command name (text between / and first whitespace)
  let nameEnd = 1;
  while (nameEnd < trimmed.length && trimmed[nameEnd] !== ' ' && trimmed[nameEnd] !== '\t') {
    nameEnd++;
  }
  const name = trimmed.slice(1, nameEnd).toLowerCase();
  const rawArgs = trimmed.slice(nameEnd).trim();
  const args = parseArgs(rawArgs);

  return { name, args, rawArgs, breakPipe };
}

// ───── Top-level API ─────

/** Parse a full slash command input into a pipeline of commands. */
export function parsePipeline(input: string): ParsedPipeline {
  const segments = splitPipeline(input);
  const commands = segments
    .filter(s => s.text.trim())
    .map(s => parseCommand(s.text, s.breakPipe));
  return { commands };
}
