// Character commands: /go, /persona, /random

import { registerCommand } from '../registry';
import type { ParsedArg, ExecutionContext } from '../types';

function getUnnamedArgs(args: ParsedArg[]): string {
  return args.filter(a => !a.key).map(a => a.value).join(' ');
}

function getNamedArg(args: ParsedArg[], key: string): string | undefined {
  return args.find(a => a.key === key)?.value;
}

registerCommand({
  name: 'go',
  description: 'Navigate to a character by name',
  category: 'character',
  usage: '/go characterName',
  async handler(args, rawArgs, ctx) {
    const name = getNamedArg(args, 'name') || getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!name) { ctx.showToast('/go: specify a character name', 'error'); return ''; }

    try {
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const chars = useCharacterStore.getState().characters;
      const match = chars.find(c =>
        c.name.toLowerCase() === name.toLowerCase() ||
        c.avatar?.toLowerCase().includes(name.toLowerCase())
      );
      if (!match) {
        ctx.showToast(`/go: character "${name}" not found`, 'error');
        return '';
      }
      useCharacterStore.getState().selectCharacter(match);
      ctx.navigate(`/chat/${match.avatar}`);
      return match.name;
    } catch (err) {
      ctx.showToast(`/go error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'persona',
  description: 'Switch the active persona',
  category: 'character',
  usage: '/persona name',
  async handler(args, rawArgs, ctx) {
    const name = getNamedArg(args, 'name') || getUnnamedArgs(args) || rawArgs || ctx.pipe;
    if (!name) { ctx.showToast('/persona: specify a persona name', 'error'); return ''; }

    try {
      const { usePersonaStore } = await import('../../../stores/personaStore');
      const store = usePersonaStore.getState();
      const match = store.personas.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!match) {
        ctx.showToast(`/persona: "${name}" not found`, 'error');
        return '';
      }
      store.setActivePersona(match.id);
      return match.name;
    } catch (err) {
      ctx.showToast(`/persona error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});

registerCommand({
  name: 'random',
  description: 'Open a random character',
  category: 'character',
  usage: '/random',
  async handler(_args, _raw, ctx) {
    try {
      const { useCharacterStore } = await import('../../../stores/characterStore');
      const chars = useCharacterStore.getState().characters;
      if (chars.length === 0) { ctx.showToast('/random: no characters', 'error'); return ''; }
      const pick = chars[Math.floor(Math.random() * chars.length)];
      useCharacterStore.getState().selectCharacter(pick);
      ctx.navigate(`/chat/${pick.avatar}`);
      return pick.name;
    } catch (err) {
      ctx.showToast(`/random error: ${err instanceof Error ? err.message : err}`, 'error');
      return '';
    }
  },
});
