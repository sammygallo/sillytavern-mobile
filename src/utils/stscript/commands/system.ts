// System commands: /help

import { registerCommand, getAllCommands } from '../registry';
import type { CommandCategory } from '../types';

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  io: 'I/O',
  variables: 'Variables',
  flow: 'Flow Control',
  math: 'Math',
  generation: 'Generation',
  messages: 'Messages',
  character: 'Character',
  quickreply: 'Quick Reply',
  prompt: 'Prompt',
  text: 'Text',
  ui: 'UI',
  system: 'System',
};

registerCommand({
  name: 'help',
  description: 'List all available slash commands',
  category: 'system',
  usage: '/help [category]',
  async handler(args, _raw, ctx) {
    const filter = args.find(a => !a.key)?.value?.toLowerCase();
    const commands = getAllCommands();

    // Group by category
    const groups = new Map<CommandCategory, typeof commands>();
    for (const cmd of commands) {
      if (filter && cmd.category !== filter && cmd.name !== filter) continue;
      const list = groups.get(cmd.category) ?? [];
      list.push(cmd);
      groups.set(cmd.category, list);
    }

    const lines: string[] = [];
    for (const [cat, cmds] of groups) {
      lines.push(`\n${CATEGORY_LABELS[cat] || cat}:`);
      for (const cmd of cmds) {
        lines.push(`  /${cmd.name} — ${cmd.description}`);
      }
    }

    const text = lines.join('\n');
    await ctx.showPopup(text);
    return text;
  },
});
