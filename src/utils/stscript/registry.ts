// Command registry — singleton map of command names to handlers.

import type { CommandDefinition, CommandHandler } from './types';

const commands = new Map<string, CommandDefinition>();

export function registerCommand(def: CommandDefinition): void {
  commands.set(def.name, def);
  for (const alias of def.aliases ?? []) {
    commands.set(alias, def);
  }
}

export function getCommand(name: string): CommandDefinition | undefined {
  return commands.get(name.toLowerCase());
}

/** All unique commands (deduped across aliases), sorted by name. */
export function getAllCommands(): CommandDefinition[] {
  const seen = new Set<CommandHandler>();
  const result: CommandDefinition[] = [];
  for (const def of commands.values()) {
    if (!seen.has(def.handler)) {
      seen.add(def.handler);
      result.push(def);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
