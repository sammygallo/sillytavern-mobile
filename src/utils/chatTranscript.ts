/**
 * Parses SillyTavern-style chat transcripts into the canonical shape accepted by
 * `/api/chats/save`. Handles three on-disk variants seen in the wild:
 *
 *   1. JSONL with a metadata first line (current ST native export).
 *   2. JSONL of messages only — no metadata header (older / third-party dumps).
 *   3. A single JSON array, either `[metadata, ...messages]` or `[...messages]`.
 *
 * Also tolerates legacy field names (`time` → `send_date`, `char_name` →
 * `character_name`) and resolves the `{{user}}` placeholder so imported chats
 * render with the importer's current display name.
 */
export interface TranscriptMetadata {
  user_name: string;
  character_name: string;
  create_date: string;
  is_group_chat?: boolean;
  [key: string]: unknown;
}

export interface TranscriptMessage {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  send_date: number;
  swipes?: string[];
  swipe_id?: number;
  character_avatar?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedTranscript {
  metadata: TranscriptMetadata;
  messages: TranscriptMessage[];
}

interface ParseOptions {
  /** Falls back here if the transcript has no `character_name` in its metadata. */
  characterName: string;
  /** Used to substitute `{{user}}` placeholders and synthesize metadata. */
  userName: string;
}

const USER_PLACEHOLDER = /\{\{user\}\}/gi;

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function looksLikeMessage(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && 'mes' in obj;
}

function looksLikeMetadata(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if ('mes' in o) return false;
  return 'user_name' in o || 'character_name' in o || 'char_name' in o || 'create_date' in o;
}

function resolveUserPlaceholder(value: unknown, userName: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(USER_PLACEHOLDER, userName);
}

function normalizeMessage(
  raw: Record<string, unknown>,
  userName: string,
  fallbackCharacterName: string
): TranscriptMessage | null {
  const mes = raw.mes;
  if (typeof mes !== 'string') return null;

  const isUser = raw.is_user === true;
  const rawName = typeof raw.name === 'string' ? raw.name : isUser ? userName : fallbackCharacterName;
  const resolvedName = resolveUserPlaceholder(rawName, userName) || (isUser ? userName : fallbackCharacterName);

  // Legacy dumps use `time` instead of `send_date`.
  const sendDateRaw = raw.send_date ?? raw.time;
  const sendDate =
    typeof sendDateRaw === 'number'
      ? sendDateRaw
      : typeof sendDateRaw === 'string' && !Number.isNaN(Date.parse(sendDateRaw))
        ? Date.parse(sendDateRaw)
        : Date.now();

  const content = resolveUserPlaceholder(mes, userName);

  const normalized: TranscriptMessage = {
    name: resolvedName,
    is_user: isUser,
    is_system: raw.is_system === true,
    mes: content,
    send_date: sendDate,
  };

  if (Array.isArray(raw.swipes)) {
    normalized.swipes = raw.swipes
      .map((s) => resolveUserPlaceholder(s, userName))
      .filter((s): s is string => typeof s === 'string');
    if (typeof raw.swipe_id === 'number') normalized.swipe_id = raw.swipe_id;
  }

  if (typeof raw.character_avatar === 'string') {
    normalized.character_avatar = raw.character_avatar;
  }

  if (raw.extra && typeof raw.extra === 'object') {
    normalized.extra = raw.extra as Record<string, unknown>;
  }

  return normalized;
}

function buildMetadata(
  raw: Record<string, unknown> | null,
  opts: ParseOptions
): TranscriptMetadata {
  const fromFile = raw ?? {};
  const userName =
    (typeof fromFile.user_name === 'string' && fromFile.user_name !== '{{user}}'
      ? fromFile.user_name
      : opts.userName) || opts.userName;

  const characterName =
    (typeof fromFile.character_name === 'string' && fromFile.character_name) ||
    (typeof fromFile.char_name === 'string' && fromFile.char_name) ||
    opts.characterName;

  const createDate =
    typeof fromFile.create_date === 'string' ? fromFile.create_date : new Date().toISOString();

  const meta: TranscriptMetadata = {
    user_name: userName,
    character_name: characterName,
    create_date: createDate,
  };

  if (fromFile.is_group_chat === true) meta.is_group_chat = true;
  return meta;
}

function parseJsonArray(arr: unknown[], opts: ParseOptions): ParsedTranscript {
  let metaRaw: Record<string, unknown> | null = null;
  let start = 0;
  if (arr.length > 0 && looksLikeMetadata(arr[0])) {
    metaRaw = arr[0] as Record<string, unknown>;
    start = 1;
  }
  const metadata = buildMetadata(metaRaw, opts);
  const messages: TranscriptMessage[] = [];
  for (let i = start; i < arr.length; i++) {
    const entry = arr[i];
    if (!looksLikeMessage(entry)) continue;
    const msg = normalizeMessage(entry as Record<string, unknown>, metadata.user_name, metadata.character_name);
    if (msg) messages.push(msg);
  }
  return { metadata, messages };
}

function parseJsonl(lines: string[], opts: ParseOptions): ParsedTranscript {
  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Skip garbage lines instead of aborting the whole import.
    }
  }
  return parseJsonArray(parsed, opts);
}

export async function parseChatTranscript(file: File, opts: ParseOptions): Promise<ParsedTranscript> {
  const text = await file.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('File is empty');

  // JSON array (wraps either [metadata, ...messages] or just messages).
  if (trimmed.startsWith('[')) {
    let arr: unknown;
    try {
      arr = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Invalid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(arr)) throw new Error('Expected a JSON array of chat entries');
    const result = parseJsonArray(arr, opts);
    if (result.messages.length === 0) throw new Error('No messages found in transcript');
    return result;
  }

  // JSONL (one JSON object per line).
  const result = parseJsonl(splitLines(trimmed), opts);
  if (result.messages.length === 0) throw new Error('No messages found in transcript');
  return result;
}

/** Produces the array that `api.saveChat` expects: [metadata, ...messages]. */
export function toSaveChatPayload(parsed: ParsedTranscript): unknown[] {
  return [parsed.metadata, ...parsed.messages];
}
