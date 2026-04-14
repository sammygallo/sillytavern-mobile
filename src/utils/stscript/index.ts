// STscript barrel — imports all command modules to trigger registration,
// then re-exports the public API.

import './commands/io';
import './commands/variables';
import './commands/flow';
import './commands/math';
import './commands/generation';
import './commands/chat';
import './commands/character';
import './commands/quickreply';
import './commands/system';
import './commands/display';
import './commands/plugins';

export { executeSlashCommand, buildExecutionContext } from './executor';
export { getAllCommands, getCommand } from './registry';
export { registerUICallbacks } from './uiCallbacks';
export type { ExecutionContext, CommandDefinition } from './types';
