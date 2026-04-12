// Variable commands: /setvar, /getvar, /addvar, /incvar, /decvar,
// /setglobalvar, /getglobalvar, /addglobalvar, /incglobalvar, /decglobalvar,
// /let, /var, /flushvar, /flushglobalvar

import { registerCommand } from '../registry';
import { resolveVariable } from '../executor';
import type { ParsedArg, ExecutionContext } from '../types';

function getNamedArg(args: ParsedArg[], key: string): string | undefined {
  return args.find(a => a.key === key)?.value;
}

function getFirstUnnamed(args: ParsedArg[]): string {
  return args.find(a => !a.key)?.value ?? '';
}

// ───── Chat-scoped variables ─────

registerCommand({
  name: 'setvar',
  description: 'Set a chat-scoped variable',
  category: 'variables',
  usage: '/setvar key=name [value]',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key');
    if (!key) { ctx.showToast('/setvar requires key=name', 'error'); return ''; }
    const value = getFirstUnnamed(args) || ctx.pipe;
    ctx.chatVariables[key] = value;
    return value;
  },
});

registerCommand({
  name: 'getvar',
  description: 'Get a chat-scoped variable',
  category: 'variables',
  usage: '/getvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    return ctx.chatVariables[key] ?? '';
  },
});

registerCommand({
  name: 'addvar',
  description: 'Add a numeric value to a chat variable',
  category: 'variables',
  usage: '/addvar key=name [delta]',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key');
    if (!key) return '';
    const delta = Number(getFirstUnnamed(args) || ctx.pipe || 0);
    const current = Number(ctx.chatVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) + (isFinite(delta) ? delta : 0));
    ctx.chatVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'incvar',
  description: 'Increment a chat variable by 1',
  category: 'variables',
  usage: '/incvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    const current = Number(ctx.chatVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) + 1);
    ctx.chatVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'decvar',
  description: 'Decrement a chat variable by 1',
  category: 'variables',
  usage: '/decvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    const current = Number(ctx.chatVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) - 1);
    ctx.chatVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'flushvar',
  description: 'Clear all chat-scoped variables',
  category: 'variables',
  usage: '/flushvar',
  handler(_args, _raw, ctx) {
    for (const k of Object.keys(ctx.chatVariables)) {
      delete ctx.chatVariables[k];
    }
    return '';
  },
});

// ───── Global variables ─────

registerCommand({
  name: 'setglobalvar',
  description: 'Set a global variable (cross-chat)',
  category: 'variables',
  usage: '/setglobalvar key=name [value]',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key');
    if (!key) { ctx.showToast('/setglobalvar requires key=name', 'error'); return ''; }
    const value = getFirstUnnamed(args) || ctx.pipe;
    ctx.globalVariables[key] = value;
    return value;
  },
});

registerCommand({
  name: 'getglobalvar',
  description: 'Get a global variable',
  category: 'variables',
  usage: '/getglobalvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    return ctx.globalVariables[key] ?? '';
  },
});

registerCommand({
  name: 'addglobalvar',
  description: 'Add a numeric value to a global variable',
  category: 'variables',
  usage: '/addglobalvar key=name [delta]',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key');
    if (!key) return '';
    const delta = Number(getFirstUnnamed(args) || ctx.pipe || 0);
    const current = Number(ctx.globalVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) + (isFinite(delta) ? delta : 0));
    ctx.globalVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'incglobalvar',
  description: 'Increment a global variable by 1',
  category: 'variables',
  usage: '/incglobalvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    const current = Number(ctx.globalVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) + 1);
    ctx.globalVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'decglobalvar',
  description: 'Decrement a global variable by 1',
  category: 'variables',
  usage: '/decglobalvar key=name',
  handler(args, _raw, ctx) {
    const key = getNamedArg(args, 'key') || getFirstUnnamed(args);
    if (!key) return '';
    const current = Number(ctx.globalVariables[key] ?? 0);
    const result = String((isFinite(current) ? current : 0) - 1);
    ctx.globalVariables[key] = result;
    return result;
  },
});

registerCommand({
  name: 'flushglobalvar',
  description: 'Clear all global variables',
  category: 'variables',
  usage: '/flushglobalvar',
  handler(_args, _raw, ctx) {
    for (const k of Object.keys(ctx.globalVariables)) {
      delete ctx.globalVariables[k];
    }
    return '';
  },
});

// ───── Scoped variables (closures) ─────

registerCommand({
  name: 'let',
  description: 'Set a variable in the current scope',
  category: 'variables',
  usage: '/let name=varname [value]',
  handler(args, _raw, ctx) {
    const name = getNamedArg(args, 'name') || getNamedArg(args, 'key');
    if (!name) {
      // Alternative syntax: /let varname value
      const unnamed = args.filter(a => !a.key);
      if (unnamed.length >= 1) {
        const varName = unnamed[0].value;
        const value = unnamed.length > 1 ? unnamed.slice(1).map(a => a.value).join(' ') : ctx.pipe;
        ctx.scope.locals[varName] = value;
        return value;
      }
      return '';
    }
    const value = getFirstUnnamed(args) || ctx.pipe;
    ctx.scope.locals[name] = value;
    return value;
  },
});

registerCommand({
  name: 'var',
  description: 'Set a variable in the parent scope',
  category: 'variables',
  usage: '/var name=varname [value]',
  handler(args, _raw, ctx) {
    const target = ctx.scope.parent ?? ctx.scope;
    const name = getNamedArg(args, 'name') || getNamedArg(args, 'key');
    if (!name) {
      const unnamed = args.filter(a => !a.key);
      if (unnamed.length >= 1) {
        const varName = unnamed[0].value;
        const value = unnamed.length > 1 ? unnamed.slice(1).map(a => a.value).join(' ') : ctx.pipe;
        target.locals[varName] = value;
        return value;
      }
      return '';
    }
    const value = getFirstUnnamed(args) || ctx.pipe;
    target.locals[name] = value;
    return value;
  },
});

// ───── Resolve scoped variable by name (for /run closures) ─────

registerCommand({
  name: 'getscoped',
  description: 'Get a scoped variable from the scope chain',
  category: 'variables',
  usage: '/getscoped name',
  handler(args, _raw, ctx) {
    const name = getFirstUnnamed(args);
    if (!name) return '';
    return resolveVariable(name, ctx.scope) ?? '';
  },
});
