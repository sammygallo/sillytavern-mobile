// Flow control commands: /if, /while, /times, /break, /abort, /return, /delay

import { registerCommand } from '../registry';
import { isClosure, unwrapClosure, executeClosure, MAX_LOOP_ITERATIONS } from '../executor';
import type { ParsedArg, ExecutionContext } from '../types';

function getNamedArg(args: ParsedArg[], key: string): string | undefined {
  return args.find(a => a.key === key)?.value;
}

function getClosures(args: ParsedArg[]): string[] {
  return args.filter(a => !a.key && isClosure(a.value)).map(a => unwrapClosure(a.value));
}

function evaluateCondition(left: string, rule: string, right: string): boolean {
  const numL = Number(left);
  const numR = Number(right);
  const bothNumeric = isFinite(numL) && isFinite(numR);

  switch (rule.toLowerCase()) {
    case 'eq':
    case '==':
    case '===':
      return left === right;
    case 'neq':
    case '!=':
    case '!==':
      return left !== right;
    case 'gt':
    case '>':
      return bothNumeric ? numL > numR : left > right;
    case 'gte':
    case '>=':
      return bothNumeric ? numL >= numR : left >= right;
    case 'lt':
    case '<':
      return bothNumeric ? numL < numR : left < right;
    case 'lte':
    case '<=':
      return bothNumeric ? numL <= numR : left <= right;
    case 'in':
      return right.includes(left);
    case 'nin':
      return !right.includes(left);
    case 'not':
      return !left || left === '0' || left === 'false' || left === '';
    default:
      return false;
  }
}

registerCommand({
  name: 'if',
  description: 'Conditional execution',
  category: 'flow',
  usage: '/if left=A rule=eq right=B {: then :} [else={: else :}]',
  async handler(args, _raw, ctx) {
    const left = getNamedArg(args, 'left') ?? '';
    const right = getNamedArg(args, 'right') ?? '';
    const rule = getNamedArg(args, 'rule') ?? 'eq';
    const closures = getClosures(args);
    const elseArg = getNamedArg(args, 'else');

    const condition = evaluateCondition(left, rule, right);

    if (condition) {
      if (closures.length > 0) {
        return await executeClosure(closures[0], ctx);
      }
    } else {
      // else branch: named arg or second closure
      if (elseArg && isClosure(elseArg)) {
        return await executeClosure(unwrapClosure(elseArg), ctx);
      }
      if (closures.length > 1) {
        return await executeClosure(closures[1], ctx);
      }
    }
    return '';
  },
});

registerCommand({
  name: 'while',
  description: 'Loop while condition is true',
  category: 'flow',
  usage: '/while left=A rule=eq right=B {: body :}',
  async handler(args, _raw, ctx) {
    const closures = getClosures(args);
    if (closures.length === 0) return '';
    const body = closures[0];
    let result = '';

    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      // Re-evaluate condition each iteration (macro expansion happens in evaluateCondition args)
      const left = getNamedArg(args, 'left') ?? '';
      const right = getNamedArg(args, 'right') ?? '';
      const rule = getNamedArg(args, 'rule') ?? 'eq';

      if (!evaluateCondition(left, rule, right)) break;

      result = await executeClosure(body, ctx);

      if (ctx.abortSignal) {
        if (ctx.abortSignal.type === 'break') {
          result = ctx.abortSignal.value;
          ctx.abortSignal = null; // consume break
        }
        break;
      }
    }

    return result;
  },
});

registerCommand({
  name: 'times',
  description: 'Execute a closure N times',
  category: 'flow',
  usage: '/times count {: body :}',
  async handler(args, _raw, ctx) {
    const countArg = args.find(a => !a.key && !isClosure(a.value));
    const count = Math.min(Number(countArg?.value ?? 0), MAX_LOOP_ITERATIONS);
    const closures = getClosures(args);
    if (closures.length === 0 || count <= 0) return '';
    const body = closures[0];
    let result = '';

    const prevTimesIndex = ctx.timesIndex;
    for (let i = 0; i < count; i++) {
      ctx.timesIndex = i;
      result = await executeClosure(body, ctx);

      if (ctx.abortSignal) {
        if (ctx.abortSignal.type === 'break') {
          result = ctx.abortSignal.value;
          ctx.abortSignal = null;
        }
        break;
      }
    }
    ctx.timesIndex = prevTimesIndex;

    return result;
  },
});

registerCommand({
  name: 'break',
  description: 'Exit a loop or closure',
  category: 'flow',
  usage: '/break [value]',
  handler(args, rawArgs, ctx) {
    const value = args.filter(a => !a.key).map(a => a.value).join(' ') || rawArgs || ctx.pipe;
    ctx.abortSignal = { type: 'break', value };
    return value;
  },
});

registerCommand({
  name: 'return',
  description: 'Return a value from a closure',
  category: 'flow',
  usage: '/return [value]',
  handler(args, rawArgs, ctx) {
    const value = args.filter(a => !a.key).map(a => a.value).join(' ') || rawArgs || ctx.pipe;
    ctx.abortSignal = { type: 'return', value };
    return value;
  },
});

registerCommand({
  name: 'abort',
  description: 'Stop all script execution',
  category: 'flow',
  usage: '/abort [reason]',
  handler(args, rawArgs, ctx) {
    const reason = args.filter(a => !a.key).map(a => a.value).join(' ') || rawArgs || 'Script aborted';
    ctx.abortSignal = { type: 'abort', reason };
    if (reason) ctx.showToast(reason, 'warning');
    return '';
  },
});

registerCommand({
  name: 'delay',
  description: 'Pause execution for milliseconds',
  category: 'flow',
  usage: '/delay milliseconds',
  async handler(args) {
    const ms = Number(args.find(a => !a.key)?.value ?? 0);
    if (ms > 0 && ms <= 30000) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
    return '';
  },
});
