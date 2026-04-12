// Chat/message commands: /send, /sendas, /sys, /comment, /del, /messages, /addswipe, /cut, /hide, /unhide

import { registerCommand } from '../registry';
import type { ParsedArg, ExecutionContext } from '../types';

function getUnnamedArgs(args: ParsedArg[]): string {
  return args.filter(a => !a.key).map(a => a.value).join(' ');
}

function getNamedArg(args: ParsedArg[], key: string): string | undefined {
  return args.find(a => a.key === key)?.value;
}

async function getChatStore() {
  const { useChatStore } = await import('../../../stores/chatStore');
  return useChatStore.getState();
}

registerCommand({
  name: 'send',
  description: 'Post a user message',
  category: 'messages',
  usage: '/send [at=index] message',
  async handler(args, rawArgs, ctx) {
    const content = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!content) return '';
    const state = await getChatStore();
    state.addMessage({
      name: 'You',
      content,
      isUser: true,
      timestamp: Date.now(),
    });
    return String(state.messages.length - 1);
  },
});

registerCommand({
  name: 'sendas',
  description: 'Post a message as a specific character',
  category: 'messages',
  usage: '/sendas name=CharName message',
  async handler(args, rawArgs, ctx) {
    const name = getNamedArg(args, 'name') ?? 'Character';
    const content = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!content) return '';
    const state = await getChatStore();
    state.addMessage({
      name,
      content,
      isUser: false,
      timestamp: Date.now(),
    });
    return String(state.messages.length - 1);
  },
});

registerCommand({
  name: 'sys',
  aliases: ['sysmes'],
  description: 'Post a system narrator message',
  category: 'messages',
  usage: '/sys message',
  async handler(args, rawArgs, ctx) {
    const content = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!content) return '';
    const state = await getChatStore();
    state.addMessage({
      name: 'System',
      content,
      isUser: false,
      isSystem: true,
      timestamp: Date.now(),
    });
    return String(state.messages.length - 1);
  },
});

registerCommand({
  name: 'comment',
  description: 'Add a hidden comment message',
  category: 'messages',
  usage: '/comment message',
  async handler(args, rawArgs, ctx) {
    const content = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!content) return '';
    const state = await getChatStore();
    state.addMessage({
      name: 'Comment',
      content: `[Comment: ${content}]`,
      isUser: false,
      isSystem: true,
      timestamp: Date.now(),
    });
    return String(state.messages.length - 1);
  },
});

registerCommand({
  name: 'del',
  aliases: ['delete'],
  description: 'Delete the last N messages',
  category: 'messages',
  usage: '/del [count]',
  async handler(args, _raw, ctx) {
    const count = Math.max(1, Number(args.find(a => !a.key)?.value ?? ctx.pipe ?? 1));
    const state = await getChatStore();
    const messages = state.messages;
    for (let i = 0; i < count && messages.length > 0; i++) {
      state.deleteMessage(messages.length - 1);
    }
    return '';
  },
});

registerCommand({
  name: 'messages',
  aliases: ['mes'],
  description: 'Get message content by index range',
  category: 'messages',
  usage: '/messages [names=on|off] start[-end]',
  async handler(args, _raw) {
    const showNames = getNamedArg(args, 'names') !== 'off';
    const rangeStr = args.find(a => !a.key)?.value ?? '';
    const state = await getChatStore();
    const messages = state.messages;

    let start = 0;
    let end = messages.length - 1;

    if (rangeStr.includes('-')) {
      const [s, e] = rangeStr.split('-').map(Number);
      if (isFinite(s)) start = Math.max(0, s);
      if (isFinite(e)) end = Math.min(messages.length - 1, e);
    } else if (rangeStr) {
      start = end = Math.max(0, Math.min(Number(rangeStr), messages.length - 1));
    }

    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
      const m = messages[i];
      if (m) {
        lines.push(showNames ? `${m.name}: ${m.content}` : m.content);
      }
    }
    return lines.join('\n');
  },
});

registerCommand({
  name: 'addswipe',
  description: 'Add an alternate response to the last AI message',
  category: 'messages',
  usage: '/addswipe text',
  async handler(args, rawArgs, ctx) {
    const content = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!content) return '';
    const state = await getChatStore();
    const messages = state.messages;
    const lastAi = [...messages].reverse().find(m => !m.isUser);
    if (!lastAi) {
      ctx.showToast('/addswipe: no AI message found', 'error');
      return '';
    }
    const idx = messages.indexOf(lastAi);
    if (idx >= 0) {
      const swipes = lastAi.swipes ?? [lastAi.content];
      state.editMessage(idx, lastAi.content, [...swipes, content]);
    }
    return '';
  },
});

registerCommand({
  name: 'cut',
  description: 'Remove messages in a range',
  category: 'messages',
  usage: '/cut from[-to]',
  async handler(args) {
    const rangeStr = args.find(a => !a.key)?.value ?? '';
    if (!rangeStr) return '';
    const state = await getChatStore();
    const messages = state.messages;

    let from = 0;
    let to = messages.length - 1;
    if (rangeStr.includes('-')) {
      const [s, e] = rangeStr.split('-').map(Number);
      if (isFinite(s)) from = Math.max(0, s);
      if (isFinite(e)) to = Math.min(messages.length - 1, e);
    } else {
      from = to = Math.max(0, Number(rangeStr));
    }

    const removed: string[] = [];
    // Delete from end to start to preserve indices
    for (let i = to; i >= from; i--) {
      if (messages[i]) {
        removed.unshift(messages[i].content);
        state.deleteMessage(i);
      }
    }
    return removed.join('\n');
  },
});

registerCommand({
  name: 'hide',
  description: 'Hide a message from the prompt (by index)',
  category: 'messages',
  usage: '/hide messageIndex',
  async handler(args, _raw, ctx) {
    const idx = Number(args.find(a => !a.key)?.value ?? ctx.pipe ?? -1);
    const state = await getChatStore();
    if (idx >= 0 && idx < state.messages.length) {
      state.editMessage(idx, state.messages[idx].content, undefined, true);
    }
    return '';
  },
});

registerCommand({
  name: 'unhide',
  description: 'Unhide a hidden message (by index)',
  category: 'messages',
  usage: '/unhide messageIndex',
  async handler(args, _raw, ctx) {
    const idx = Number(args.find(a => !a.key)?.value ?? ctx.pipe ?? -1);
    const state = await getChatStore();
    if (idx >= 0 && idx < state.messages.length) {
      state.editMessage(idx, state.messages[idx].content, undefined, false);
    }
    return '';
  },
});
