// Generation commands: /gen, /trigger, /continue, /swipe, /regenerate

import { registerCommand } from '../registry';
import type { ParsedArg, ExecutionContext } from '../types';

function getUnnamedArgs(args: ParsedArg[]): string {
  return args.filter(a => !a.key).map(a => a.value).join(' ');
}

registerCommand({
  name: 'gen',
  description: 'Generate an AI response (uses pipe or args as prompt context)',
  category: 'generation',
  usage: '/gen [prompt text]',
  async handler(args, rawArgs, ctx) {
    const prompt = getUnnamedArgs(args) || rawArgs || ctx.pipe;
    try {
      const { useChatStore } = await import('../../../stores/chatStore');
      const state = useChatStore.getState();
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const charState = useCharacterStore.getState();
      const character = charState.selectedCharacter;
      if (!character) {
        ctx.showToast('/gen: no character selected', 'error');
        return '';
      }

      // Inject prompt as a temporary system message, generate, capture response
      if (prompt) {
        state.addMessage({
          name: 'System',
          content: prompt,
          isUser: false,
          isSystem: true,
          timestamp: Date.now(),
        });
      }

      await state.sendMessage('', character);

      // Get last AI message as result
      const messages = useChatStore.getState().messages;
      const lastAi = [...messages].reverse().find(m => !m.isUser && !m.isSystem);
      return lastAi?.content ?? '';
    } catch (err) {
      ctx.showToast(`/gen error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'trigger',
  description: 'Trigger a normal AI response generation',
  category: 'generation',
  usage: '/trigger',
  async handler(_args, _raw, ctx) {
    try {
      const { useChatStore } = await import('../../../stores/chatStore');
      const state = useChatStore.getState();
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const character = useCharacterStore.getState().selectedCharacter;
      if (!character) {
        ctx.showToast('/trigger: no character selected', 'error');
        return '';
      }

      const content = ctx.pipe || '';
      await state.sendMessage(content, character);

      const messages = useChatStore.getState().messages;
      const lastAi = [...messages].reverse().find(m => !m.isUser && !m.isSystem);
      return lastAi?.content ?? '';
    } catch (err) {
      ctx.showToast(`/trigger error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'continue',
  aliases: ['cont'],
  description: 'Continue the last AI message',
  category: 'generation',
  usage: '/continue',
  async handler(_args, _raw, ctx) {
    try {
      const { useChatStore } = await import('../../../stores/chatStore');
      const state = useChatStore.getState();
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const character = useCharacterStore.getState().selectedCharacter;
      if (!character) return '';

      await state.continueMessage(character);
      return '';
    } catch (err) {
      ctx.showToast(`/continue error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'swipe',
  description: 'Swipe to generate an alternate response',
  category: 'generation',
  usage: '/swipe',
  async handler(_args, _raw, ctx) {
    try {
      const { useChatStore } = await import('../../../stores/chatStore');
      const state = useChatStore.getState();
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const character = useCharacterStore.getState().selectedCharacter;
      if (!character) return '';

      const messages = state.messages;
      const lastAi = [...messages].reverse().find(m => !m.isUser);
      if (!lastAi) return '';

      const idx = messages.indexOf(lastAi);
      if (idx >= 0) {
        await state.swipeRight(idx, character);
      }
      return '';
    } catch (err) {
      ctx.showToast(`/swipe error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'regenerate',
  aliases: ['regen'],
  description: 'Regenerate the last AI response',
  category: 'generation',
  usage: '/regenerate',
  async handler(_args, _raw, ctx) {
    try {
      const { useChatStore } = await import('../../../stores/chatStore');
      const state = useChatStore.getState();
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const character = useCharacterStore.getState().selectedCharacter;
      if (!character) return '';

      await state.regenerateMessage(character);
      return '';
    } catch (err) {
      ctx.showToast(`/regenerate error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});
