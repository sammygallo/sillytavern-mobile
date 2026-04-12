// STscript type definitions — shared across parser, executor, registry, and commands.

// ───── Parsed Representation ─────

/** A single parsed argument — either named (key=value) or positional. */
export interface ParsedArg {
  key?: string;
  value: string;
}

/** A single command invocation within a pipeline. */
export interface ParsedCommand {
  name: string;              // e.g. "echo", "setvar" (no leading /)
  args: ParsedArg[];         // ordered list of parsed arguments
  rawArgs: string;           // raw argument string after command name
  /** Preceded by || (double pipe) — pipe value NOT auto-injected. */
  breakPipe: boolean;
}

/** A complete parsed pipeline — one or more commands separated by | */
export interface ParsedPipeline {
  commands: ParsedCommand[];
}

// ───── Execution ─────

export type AbortReason =
  | { type: 'break'; value: string }
  | { type: 'return'; value: string }
  | { type: 'abort'; reason: string }
  | { type: 'error'; message: string };

/** A variable scope — /let creates entries here; scopes nest for closures. */
export interface Scope {
  locals: Record<string, string>;
  parent: Scope | null;
}

export type ToastVariant = 'info' | 'warning' | 'error' | 'success';

/** Mutable execution state threaded through every command. */
export interface ExecutionContext {
  pipe: string;
  scope: Scope;
  chatVariables: Record<string, string>;
  globalVariables: Record<string, string>;
  timesIndex: number;
  originalInput: string;
  abortSignal: AbortReason | null;
  recursionDepth: number;

  // UI callbacks (registered by ChatView)
  showToast: (message: string, variant?: ToastVariant) => void;
  setInputText: (text: string) => void;
  showPopup: (message: string, buttons?: string[]) => Promise<string>;
  showInputPrompt: (message: string, defaultValue?: string) => Promise<string | null>;

  // Navigation
  navigate: (path: string) => void;
}

// ───── Command Registration ─────

export type CommandHandler = (
  args: ParsedArg[],
  rawArgs: string,
  ctx: ExecutionContext,
) => Promise<string> | string;

export type CommandCategory =
  | 'io'
  | 'variables'
  | 'flow'
  | 'math'
  | 'generation'
  | 'messages'
  | 'character'
  | 'quickreply'
  | 'prompt'
  | 'text'
  | 'ui'
  | 'system';

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  category: CommandCategory;
  usage?: string;
  handler: CommandHandler;
}
