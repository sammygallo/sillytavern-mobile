// Math commands: /add, /sub, /mul, /div, /mod, /pow, /sqrt, /abs, /round, /rand, /max, /min

import { registerCommand } from '../registry';
import type { ParsedArg, ExecutionContext } from '../types';

/** Extract up to 2 numeric operands from unnamed args, using pipe as fallback for first. */
function getOperands(args: ParsedArg[], ctx: ExecutionContext): [number, number] {
  const unnamed = args.filter(a => !a.key).map(a => Number(a.value));
  if (unnamed.length >= 2) return [unnamed[0], unnamed[1]];
  if (unnamed.length === 1) return [Number(ctx.pipe || 0), unnamed[0]];
  return [Number(ctx.pipe || 0), 0];
}

function getSingle(args: ParsedArg[], ctx: ExecutionContext): number {
  const first = args.find(a => !a.key);
  return Number(first?.value ?? ctx.pipe ?? 0);
}

function safeNum(n: number): string {
  return isFinite(n) ? String(n) : '0';
}

registerCommand({
  name: 'add',
  description: 'Add two numbers',
  category: 'math',
  usage: '/add a b',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(a + b); },
});

registerCommand({
  name: 'sub',
  description: 'Subtract two numbers',
  category: 'math',
  usage: '/sub a b',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(a - b); },
});

registerCommand({
  name: 'mul',
  description: 'Multiply two numbers',
  category: 'math',
  usage: '/mul a b',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(a * b); },
});

registerCommand({
  name: 'div',
  description: 'Divide two numbers',
  category: 'math',
  usage: '/div a b',
  handler(args, _raw, ctx) {
    const [a, b] = getOperands(args, ctx);
    return b === 0 ? '0' : safeNum(a / b);
  },
});

registerCommand({
  name: 'mod',
  description: 'Modulo of two numbers',
  category: 'math',
  usage: '/mod a b',
  handler(args, _raw, ctx) {
    const [a, b] = getOperands(args, ctx);
    return b === 0 ? '0' : safeNum(a % b);
  },
});

registerCommand({
  name: 'pow',
  description: 'Raise to a power',
  category: 'math',
  usage: '/pow base exponent',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(Math.pow(a, b)); },
});

registerCommand({
  name: 'sqrt',
  description: 'Square root',
  category: 'math',
  usage: '/sqrt number',
  handler(args, _raw, ctx) { return safeNum(Math.sqrt(getSingle(args, ctx))); },
});

registerCommand({
  name: 'abs',
  description: 'Absolute value',
  category: 'math',
  usage: '/abs number',
  handler(args, _raw, ctx) { return safeNum(Math.abs(getSingle(args, ctx))); },
});

registerCommand({
  name: 'round',
  description: 'Round to nearest integer',
  category: 'math',
  usage: '/round number',
  handler(args, _raw, ctx) { return safeNum(Math.round(getSingle(args, ctx))); },
});

registerCommand({
  name: 'rand',
  description: 'Random number in range',
  category: 'math',
  usage: '/rand [min] [max]',
  handler(args) {
    const unnamed = args.filter(a => !a.key).map(a => Number(a.value));
    if (unnamed.length >= 2) {
      const min = Math.floor(unnamed[0]);
      const max = Math.floor(unnamed[1]);
      return String(min + Math.floor(Math.random() * (max - min + 1)));
    }
    if (unnamed.length === 1) {
      return String(Math.floor(Math.random() * Math.floor(unnamed[0])));
    }
    return String(Math.random());
  },
});

registerCommand({
  name: 'max',
  description: 'Maximum of two numbers',
  category: 'math',
  usage: '/max a b',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(Math.max(a, b)); },
});

registerCommand({
  name: 'min',
  description: 'Minimum of two numbers',
  category: 'math',
  usage: '/min a b',
  handler(args, _raw, ctx) { const [a, b] = getOperands(args, ctx); return safeNum(Math.min(a, b)); },
});
