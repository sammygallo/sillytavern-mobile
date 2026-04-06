import { create } from 'zustand';
import {
  api,
  type CharacterInfo,
  type GenerationOptions,
  type GenerationImage,
} from '../api/client';
import { useSettingsStore } from './settingsStore';
import { usePersonaStore } from './personaStore';
import { useGenerationStore } from './generationStore';
import { useCharacterStore } from './characterStore';
import {
  useWorldInfoStore,
  scanMessagesForEntries,
  type WorldInfoPosition,
  type MatchedEntry,
} from './worldInfoStore';
import { parseEmotion, stripEmotionTag, type Emotion } from '../utils/emotions';
import { dataUrlToPart, supportsVision } from '../utils/images';
import { processMacros, type MacroContext } from '../utils/macros';
import {
  estimateConversationTokens,
  estimateMessageTokens,
  profileForProvider,
  trimHistoryToBudget,
} from '../utils/tokenizer';
import { getInstructTemplate, formatInstructPrompt } from '../utils/instructTemplates';

export interface ChatMessage {
  id: string;
  name: string;
  isUser: boolean;
  isSystem: boolean;
  content: string;
  timestamp: number;
  emotion?: Emotion | null;
  characterAvatar?: string;
  swipes: string[];
  swipeId: number;
  /** Phase 6.1: user-attached images as data URLs (e.g. data:image/jpeg;base64,...).
   *  Rendered as a grid above content in ChatMessage.tsx and folded into the
   *  provider's multimodal content parts on the LAST user turn when calling
   *  generateMessage. Persisted into the JSONL record's `extra.images` field. */
  images?: string[];
}

interface ChatFile {
  fileName: string;
  fileSize: number;
  lastMessage: string;
}

/**
 * Strategies that decide which group-chat member(s) respond on each user turn.
 * - list: every member speaks in order (legacy behavior, preserved as default).
 * - natural: pick the member mentioned in the last message, else weighted roll
 *   by talkativeness. Exactly one member responds.
 * - pooled: weighted random pick from the pool, excluding the N most recent
 *   speakers. Exactly one member responds.
 * - manual: no auto-selection; user must force-talk a specific member.
 */
export type GroupActivationStrategy = 'list' | 'natural' | 'pooled' | 'manual';

export const DEFAULT_GROUP_ACTIVATION_STRATEGY: GroupActivationStrategy = 'list';
export const DEFAULT_POOLED_EXCLUDE_RECENT = 1;
export const DEFAULT_AUTO_MODE_DELAY_MS = 1500;

export interface GroupChatInfo {
  fileName: string;
  characterNames: string[];
  characterAvatars: string[];
  lastMessage: string;
  createdAt: number;
  /** How the next speaker is chosen each turn. Added in Phase 5.1. */
  activationStrategy: GroupActivationStrategy;
  /** Avatars of members whose turns are skipped. Added in Phase 5.1. */
  mutedAvatars: string[];
  /** Recent-speaker exclusion window for pooled strategy (N≥0). */
  pooledExcludeRecent: number;
  /** Phase 5.2: auto-continue generation after each AI turn. */
  autoModeEnabled: boolean;
  /** Phase 5.2: delay between auto-mode turns in milliseconds. */
  autoModeDelayMs: number;
  /** Phase 5.2: optional group-wide scenario replacing per-character scenario. */
  scenarioOverride: string;
  /** Phase 5.3: per-member talkativeness override (avatar → [0,1]). Does not
   *  mutate the card; only applies inside this group for weighted strategies. */
  talkativenessOverrides: Record<string, number>;
  /** Phase 5.3: user-editable chat title. Falls back to comma-joined names. */
  title?: string;
}

/** Phase 8.1: per-chat Author's Note — a persistent instruction that gets
 *  injected into the AI prompt at a configurable depth from the end of the
 *  conversation history. Stored in localStorage keyed by chat file name. */
export interface AuthorNote {
  content: string;
  depth: number;
  role: 'system' | 'user' | 'assistant';
}

const AUTHOR_NOTES_KEY = 'sillytavern_author_notes';

function loadAuthorNotesFromStorage(): Record<string, AuthorNote> {
  try {
    const stored = localStorage.getItem(AUTHOR_NOTES_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveAuthorNotesToStorage(notes: Record<string, AuthorNote>) {
  localStorage.setItem(AUTHOR_NOTES_KEY, JSON.stringify(notes));
}

const GROUP_CHATS_KEY = 'sillytavern_group_chats';

/**
 * Fill defaults for pre-Phase-5.1 records so the rest of the code can assume
 * the new fields are always present.
 */
function migrateGroupChat(raw: Partial<GroupChatInfo> & {
  fileName: string;
  characterNames: string[];
  characterAvatars: string[];
}): GroupChatInfo {
  return {
    fileName: raw.fileName,
    characterNames: raw.characterNames ?? [],
    characterAvatars: raw.characterAvatars ?? [],
    lastMessage: raw.lastMessage ?? '',
    createdAt: raw.createdAt ?? Date.now(),
    activationStrategy:
      raw.activationStrategy === 'natural' ||
      raw.activationStrategy === 'pooled' ||
      raw.activationStrategy === 'list' ||
      raw.activationStrategy === 'manual'
        ? raw.activationStrategy
        : DEFAULT_GROUP_ACTIVATION_STRATEGY,
    mutedAvatars: Array.isArray(raw.mutedAvatars) ? raw.mutedAvatars : [],
    pooledExcludeRecent:
      typeof raw.pooledExcludeRecent === 'number' && raw.pooledExcludeRecent >= 0
        ? Math.floor(raw.pooledExcludeRecent)
        : DEFAULT_POOLED_EXCLUDE_RECENT,
    autoModeEnabled:
      typeof raw.autoModeEnabled === 'boolean' ? raw.autoModeEnabled : false,
    autoModeDelayMs:
      typeof raw.autoModeDelayMs === 'number' && raw.autoModeDelayMs >= 0
        ? Math.floor(raw.autoModeDelayMs)
        : DEFAULT_AUTO_MODE_DELAY_MS,
    scenarioOverride:
      typeof raw.scenarioOverride === 'string' ? raw.scenarioOverride : '',
    talkativenessOverrides: sanitizeTalkativenessOverrides(
      (raw as Partial<GroupChatInfo>).talkativenessOverrides
    ),
    title:
      typeof (raw as Partial<GroupChatInfo>).title === 'string'
        ? (raw as Partial<GroupChatInfo>).title
        : undefined,
  };
}

function sanitizeTalkativenessOverrides(
  raw: unknown
): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !isFinite(value)) continue;
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    out[key] = clamped;
  }
  return out;
}

function loadGroupChatsFromStorage(): GroupChatInfo[] {
  try {
    const stored = localStorage.getItem(GROUP_CHATS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateGroupChat);
  } catch {
    return [];
  }
}

function saveGroupChatsToStorage(groupChats: GroupChatInfo[]) {
  localStorage.setItem(GROUP_CHATS_KEY, JSON.stringify(groupChats));
}

/** Parse the per-character "talkativeness" extension, clamped to [0, 1].
 *  Falls back to 0.5 when absent, not a number, or out of range.
 *
 *  Phase 5.3: optional `override` (0..1) wins when supplied — this is how
 *  group-level talkativeness sliders take effect without mutating the card. */
export function getTalkativeness(
  character: CharacterInfo,
  override?: number
): number {
  if (typeof override === 'number' && isFinite(override)) {
    if (override < 0) return 0;
    if (override > 1) return 1;
    return override;
  }
  const raw = character.data?.extensions?.talkativeness;
  if (typeof raw !== 'string') return 0.5;
  const n = parseFloat(raw);
  if (!isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Weighted random pick using talkativeness. Falls back to uniform when all
 *  weights are zero or the pool has a single entry.
 *
 *  Phase 5.3: `overrides` (avatar → weight) lets the caller inject group-scope
 *  talkativeness values without mutating the card. */
function weightedRandomPick(
  pool: CharacterInfo[],
  overrides: Record<string, number> | undefined,
  rng: () => number = Math.random
): CharacterInfo | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const weights = pool.map((c) => getTalkativeness(c, overrides?.[c.avatar]));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return pool[Math.floor(rng() * pool.length)];
  }
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Natural Order: pick the character whose name appears in the last
 *  non-system message. If multiple match, weighted roll within the matches.
 *  If none match, weighted roll across the full pool. */
export function selectNaturalOrderSpeaker(
  candidates: CharacterInfo[],
  messages: ChatMessage[],
  overrides?: Record<string, number>,
  rng: () => number = Math.random
): CharacterInfo | null {
  if (candidates.length === 0) return null;

  const lastMeaningful = [...messages].reverse().find((m) => !m.isSystem);
  if (!lastMeaningful || !lastMeaningful.content.trim()) {
    return weightedRandomPick(candidates, overrides, rng);
  }

  const haystack = lastMeaningful.content;
  const mentioned = candidates.filter((c) => {
    const name = (c.name || '').trim();
    if (!name) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    return pattern.test(haystack);
  });

  if (mentioned.length === 0) {
    return weightedRandomPick(candidates, overrides, rng);
  }
  return weightedRandomPick(mentioned, overrides, rng);
}

/** Pooled Order: weighted random pick from the candidates, excluding
 *  the N most recent distinct AI speakers. If exclusion empties the pool
 *  the full candidate set is used as a safety fallback. */
export function selectPooledOrderSpeaker(
  candidates: CharacterInfo[],
  messages: ChatMessage[],
  excludeRecent: number,
  overrides?: Record<string, number>,
  rng: () => number = Math.random
): CharacterInfo | null {
  if (candidates.length === 0) return null;
  const n = Math.max(0, Math.floor(excludeRecent));
  if (n === 0) return weightedRandomPick(candidates, overrides, rng);

  const recent: string[] = [];
  for (let i = messages.length - 1; i >= 0 && recent.length < n; i--) {
    const m = messages[i];
    if (m.isUser || m.isSystem) continue;
    if (!recent.includes(m.name)) recent.push(m.name);
  }

  const pool = candidates.filter((c) => !recent.includes(c.name));
  if (pool.length === 0) return weightedRandomPick(candidates, overrides, rng);
  return weightedRandomPick(pool, overrides, rng);
}

interface ChatState {
  messages: ChatMessage[];
  chatFiles: ChatFile[];
  groupChats: GroupChatInfo[];
  currentChatFile: string | null;
  isLoading: boolean;
  isSending: boolean;
  isStreaming: boolean;
  error: string | null;
  abortController: AbortController | null;
  /** Phase 5.3: name of the character currently drafting a reply, surfaced
   *  in the group-chat typing indicator. `null` when nobody is typing. */
  currentSpeakerName: string | null;

  // Existing actions
  fetchChatFiles: (avatarUrl: string) => Promise<void>;
  loadChat: (avatarUrl: string, fileName: string) => Promise<void>;
  loadGroupChat: (groupChat: GroupChatInfo) => Promise<void>;
  startNewChat: (character: CharacterInfo) => Promise<void>;
  startNewGroupChat: (characters: CharacterInfo[]) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'swipes' | 'swipeId'>) => void;
  sendMessage: (
    content: string,
    character: CharacterInfo,
    availableEmotions?: string[],
    images?: string[]
  ) => Promise<void>;
  sendGroupMessage: (
    content: string,
    characters: CharacterInfo[],
    images?: string[]
  ) => Promise<void>;
  /** Phase 5.2: force a single member to respond next, bypassing strategy + mute. */
  forceGroupMemberTalk: (character: CharacterInfo, characters: CharacterInfo[]) => Promise<void>;
  editMessageAndRegenerate: (messageId: string, newContent: string, character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  clearChat: () => void;
  refreshGroupChats: () => void;
  deleteGroupChat: (fileName: string) => void;

  // Phase 5.1: activation strategies + per-member mute
  setGroupActivationStrategy: (fileName: string, strategy: GroupActivationStrategy) => void;
  toggleGroupMute: (fileName: string, avatar: string) => void;
  setGroupPooledExcludeRecent: (fileName: string, n: number) => void;
  getGroupChatByFile: (fileName: string) => GroupChatInfo | null;

  // Phase 5.2: auto-mode, reorder, scenario override
  setGroupAutoMode: (fileName: string, enabled: boolean) => void;
  setGroupAutoModeDelay: (fileName: string, delayMs: number) => void;
  setGroupScenarioOverride: (fileName: string, scenario: string) => void;
  reorderGroupMembers: (fileName: string, avatars: string[]) => void;

  // Phase 5.3: per-member talkativeness overrides, title, live add/remove
  setGroupTalkativenessOverride: (
    fileName: string,
    avatar: string,
    value: number | null
  ) => void;
  setGroupTitle: (fileName: string, title: string) => void;
  addGroupChatMember: (fileName: string, character: CharacterInfo) => void;
  removeGroupChatMember: (fileName: string, avatar: string) => void;

  // Phase 8.1: Author's Note
  authorNotes: Record<string, AuthorNote>;
  getAuthorNote: (fileName: string) => AuthorNote | null;
  setAuthorNote: (fileName: string, note: Partial<AuthorNote>) => void;

  // New Phase 1 actions
  stopGeneration: () => void;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  swipeLeft: (messageId: string) => void;
  swipeRight: (messageId: string, character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  regenerateMessage: (character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  continueMessage: (character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  impersonate: (character: CharacterInfo, availableEmotions?: string[]) => Promise<string>;
  deleteChat: (avatarUrl: string, fileName: string) => Promise<void>;
}

let messageIdCounter = 0;
const generateId = () => `msg_${++messageIdCounter}_${Date.now()}`;

// Parse SSE stream and extract content tokens
async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (!data || data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content =
              json.choices?.[0]?.delta?.content ||
              json.choices?.[0]?.text ||
              json.delta?.text ||
              (json.type === 'content_block_delta' ? json.delta?.text : null) ||
              json.content ||
              json.message?.content?.[0]?.text ||
              '';
            if (content) yield content;
          } catch {
            if (data.length > 0 && data !== 'undefined') yield data;
          }
        } else if (!trimmed.startsWith(':') && !trimmed.startsWith('event:')) {
          if (trimmed.length > 0) yield trimmed;
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data && data !== '[DONE]') {
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content ||
                           json.choices?.[0]?.text ||
                           json.delta?.text ||
                           json.content || '';
            if (content) yield content;
          } catch {
            yield data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Resolve advanced character fields (checks both top-level and data.*)
function getCharacterField(character: CharacterInfo, field: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const top = (character as any)[field];
  if (typeof top === 'string' && top.trim()) return top;
  const data = character.data as Record<string, unknown> | undefined;
  const nested = data?.[field];
  if (typeof nested === 'string' && nested.trim()) return nested;
  return '';
}

function getAlternateGreetings(character: CharacterInfo): string[] {
  return (
    character.alternate_greetings || character.data?.alternate_greetings || []
  ).filter((g) => g && g.trim());
}

function getDepthPrompt(character: CharacterInfo): {
  prompt: string;
  depth: number;
  role: 'system' | 'user' | 'assistant';
} | null {
  const dp = character.data?.extensions?.depth_prompt;
  if (!dp || !dp.prompt?.trim()) return null;
  return {
    prompt: dp.prompt,
    depth: dp.depth ?? 4,
    role: (dp.role as 'system' | 'user' | 'assistant') || 'system',
  };
}

// Build full macro context from character, persona, and chat state.
function buildMacroContext(
  character: CharacterInfo,
  personaName: string,
  personaDescription: string,
  messages: ChatMessage[],
  model: string
): MacroContext {
  const nonSystem = messages.filter((m) => !m.isSystem);
  const lastMessage = nonSystem[nonSystem.length - 1]?.content || '';
  const lastUser = [...nonSystem].reverse().find((m) => m.isUser)?.content || '';
  const lastChar = [...nonSystem].reverse().find((m) => !m.isUser)?.content || '';

  return {
    charName: character.name || '',
    userName: personaName || 'User',
    personaName: personaName || 'User',
    personaDescription: personaDescription || '',
    characterDescription:
      character.description || character.data?.description || '',
    characterPersonality:
      character.personality || character.data?.personality || '',
    characterScenario: character.scenario || character.data?.scenario || '',
    lastMessage,
    lastUserMessage: lastUser,
    lastCharMessage: lastChar,
    model,
  };
}

// Build conversation context for AI
function buildConversationContext(
  messages: ChatMessage[],
  character: CharacterInfo,
  availableEmotions?: string[]
): { role: 'user' | 'assistant' | 'system'; content: string }[] {
  const context: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

  // Get active persona for this character/chat
  const persona = usePersonaStore
    .getState()
    .getPersonaForContext(character.avatar);
  const personaName = persona?.name || 'You';
  const personaDescription = persona?.description || '';

  // Get generation config + provider for macros/tokenizer
  const genState = useGenerationStore.getState();
  const { activeModel, activeProvider } = useSettingsStore.getState();

  const macroCtx = buildMacroContext(
    character,
    personaName,
    personaDescription,
    messages,
    activeModel
  );
  const sub = (text: string) => (text ? processMacros(text, macroCtx) : '');

  // Scan active world info books for keyword matches against recent history.
  // The character's embedded book + per-character linked books are
  // auto-activated at scan time (scoped to this call), leaving the global
  // `activeBookIds` list untouched as the user navigates between characters.
  const wiState = useWorldInfoStore.getState();
  const charBookIds = useCharacterStore
    .getState()
    .getActiveBookIdsForCharacter(character.avatar || '');
  const scanBookIds = Array.from(
    new Set([...wiState.activeBookIds, ...charBookIds])
  );
  const tokenProfile = profileForProvider(activeProvider);
  const matchedEntries = scanMessagesForEntries(
    wiState.books,
    scanBookIds,
    messages,
    {
      scanDepth: wiState.scanDepth,
      maxRecursionSteps: wiState.maxRecursionSteps,
      tokenBudget: wiState.tokenBudget,
      profile: tokenProfile,
    }
  );
  const wiByPosition: Record<WorldInfoPosition, MatchedEntry[]> = {
    before_char: [],
    after_char: [],
    before_an: [],
    after_an: [],
    at_depth: [],
  };
  for (const m of matchedEntries) {
    wiByPosition[m.entry.position].push(m);
  }
  const joinWi = (list: MatchedEntry[]): string =>
    list
      .map((m) => sub(m.entry.content))
      .filter((c) => c.trim().length > 0)
      .join('\n\n');

  const description = sub(getCharacterField(character, 'description'));
  const personality = sub(getCharacterField(character, 'personality'));
  const scenario = sub(getCharacterField(character, 'scenario'));
  const mesExample = sub(getCharacterField(character, 'mes_example'));
  const charSystemPromptOverride = genState.prompt.respectCharacterOverride
    ? sub(getCharacterField(character, 'system_prompt'))
    : '';
  const charPostHistoryInstructions = genState.prompt.respectCharacterPHI
    ? sub(getCharacterField(character, 'post_history_instructions'))
    : '';

  // User-level prompt overrides from generation settings
  const userMainPrompt = sub(genState.prompt.mainPrompt);
  const userPHI = sub(genState.prompt.postHistoryInstructions);
  const userJailbreak = sub(genState.prompt.jailbreakPrompt);

  const emotionList = availableEmotions && availableEmotions.length > 0
    ? availableEmotions.join(', ')
    : 'neutral (or any emotion that fits the moment)';

  const emotionInstruction = `
IMPORTANT: Begin each response with an emotion tag that reflects your current emotional state. Use this exact format: [emotion:TAG]

Available emotions for this character: ${emotionList}

Example: [emotion:joy] I'm so glad you asked about that!

Choose the emotion that best matches how ${character.name} would feel based on the conversation context.`.trim();

  // Build character info block
  const charInfoParts = [
    description && `Description: ${description}`,
    personality && `Personality: ${personality}`,
    scenario && `Scenario: ${scenario}`,
    mesExample && `Example dialogue:\n${mesExample}`,
  ].filter(Boolean);

  const charInfoBlock = charInfoParts.join('\n\n');

  // Main system prompt: character override > user override > default
  const mainPrompt =
    charSystemPromptOverride ||
    userMainPrompt ||
    `You are ${character.name}. Stay in character.`;

  // Persona description injection
  let personaBlock = '';
  if (persona && personaDescription.trim()) {
    const position = persona.descriptionPosition;
    if (position === 'in_prompt' || position === 'before_char') {
      personaBlock = `[The user you're talking to is ${personaName}. ${personaDescription}]`;
    } else if (position === 'after_char') {
      // handled later
    }
  }

  // Assemble system prompt parts in order
  const systemParts: string[] = [mainPrompt];
  if (persona && persona.descriptionPosition === 'before_char' && personaBlock) {
    systemParts.push(personaBlock);
  }
  const wiBeforeChar = joinWi(wiByPosition.before_char);
  if (wiBeforeChar) {
    systemParts.push(wiBeforeChar);
  }
  if (charInfoBlock) {
    systemParts.push(charInfoBlock);
  }
  const wiAfterChar = joinWi(wiByPosition.after_char);
  if (wiAfterChar) {
    systemParts.push(wiAfterChar);
  }
  if (persona && persona.descriptionPosition === 'after_char' && personaDescription) {
    systemParts.push(`[The user you're talking to is ${personaName}. ${personaDescription}]`);
  }
  if (persona && persona.descriptionPosition === 'in_prompt' && personaDescription) {
    // Only add it once; if not added as before_char
    // Already added as before_char, so only add if not already
  }
  const wiBeforeAn = joinWi(wiByPosition.before_an);
  if (wiBeforeAn) {
    systemParts.push(wiBeforeAn);
  }
  if (userJailbreak) {
    systemParts.push(userJailbreak);
  }
  systemParts.push(emotionInstruction);

  context.push({
    role: 'system',
    content: systemParts.filter(Boolean).join('\n\n'),
  });

  // Decide how many messages to consider for history.
  const ctxConfig = genState.context;
  const historyPool = ctxConfig.tokenAware
    ? messages.filter((m) => !m.isSystem)
    : messages.slice(-ctxConfig.messageCount).filter((m) => !m.isSystem);
  const recentMessages = historyPool;

  // Character's Note (depth prompt): inject at configurable depth from the END of the history
  const depthPrompt = getDepthPrompt(character);
  const depthPromptContent = depthPrompt ? sub(depthPrompt.prompt) : '';

  // Phase 8.1: Author's Note — per-chat persistent instruction injected at depth
  const { currentChatFile } = useChatStore.getState();
  const authorNote = currentChatFile
    ? useChatStore.getState().getAuthorNote(currentChatFile)
    : null;

  // Persona @ depth
  const personaAtDepth =
    persona && persona.descriptionPosition === 'at_depth' && personaDescription
      ? {
          depth: persona.descriptionDepth,
          role: persona.descriptionRole,
          content: `[The user you're talking to is ${personaName}. ${personaDescription}]`,
        }
      : null;

  // Build a list of history messages with depth-based insertions
  const historyWithInsertions: {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }[] = [];

  // Group WI at-depth entries by their depth value for interleaved injection.
  const wiAtDepthByDepth: Record<number, MatchedEntry[]> = {};
  for (const m of wiByPosition.at_depth) {
    const d = Math.max(0, Math.floor(m.entry.depth));
    if (!wiAtDepthByDepth[d]) wiAtDepthByDepth[d] = [];
    wiAtDepthByDepth[d].push(m);
  }

  for (let i = 0; i < recentMessages.length; i++) {
    const msg = recentMessages[i];
    const depthFromEnd = recentMessages.length - i;

    // Insert depth-prompt items BEFORE this message if depth matches
    if (depthPrompt && depthFromEnd === depthPrompt.depth && depthPromptContent) {
      historyWithInsertions.push({
        role: depthPrompt.role,
        content: depthPromptContent,
      });
    }
    // Phase 8.1: Author's Note injection at depth
    if (authorNote && depthFromEnd === authorNote.depth) {
      historyWithInsertions.push({
        role: authorNote.role,
        content: sub(authorNote.content),
      });
    }
    if (personaAtDepth && depthFromEnd === personaAtDepth.depth) {
      historyWithInsertions.push({
        role: personaAtDepth.role,
        content: personaAtDepth.content,
      });
    }
    // WI at-depth entries: inject as system messages at the matching depth
    const wiHere = wiAtDepthByDepth[depthFromEnd];
    if (wiHere && wiHere.length > 0) {
      const content = joinWi(wiHere);
      if (content) {
        historyWithInsertions.push({ role: 'system', content });
      }
    }

    historyWithInsertions.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: sub(msg.content),
    });
  }

  // If depth exceeds history length, prepend to entire history
  if (
    depthPrompt &&
    depthPromptContent &&
    depthPrompt.depth > recentMessages.length
  ) {
    historyWithInsertions.unshift({
      role: depthPrompt.role,
      content: depthPromptContent,
    });
  }
  if (authorNote && authorNote.depth > recentMessages.length) {
    historyWithInsertions.unshift({
      role: authorNote.role,
      content: sub(authorNote.content),
    });
  }
  if (personaAtDepth && personaAtDepth.depth > recentMessages.length) {
    historyWithInsertions.unshift({
      role: personaAtDepth.role,
      content: personaAtDepth.content,
    });
  }
  // WI at-depth: any entries whose depth exceeds history length prepend.
  for (const depthKey of Object.keys(wiAtDepthByDepth)) {
    const d = parseInt(depthKey, 10);
    if (d > recentMessages.length) {
      const content = joinWi(wiAtDepthByDepth[d]);
      if (content) {
        historyWithInsertions.unshift({ role: 'system', content });
      }
    }
  }

  // Token-aware trimming: keep system prompts, drop oldest history that exceeds budget
  if (ctxConfig.tokenAware) {
    const systemPrompts = context.slice(); // system prompt we already pushed
    const { kept, usedTokens } = trimHistoryToBudget(
      systemPrompts,
      historyWithInsertions,
      ctxConfig.responseReserve,
      ctxConfig.maxTokens,
      tokenProfile
    );
    context.push(...kept);
    genState.setLastTokenEstimate(usedTokens);
  } else {
    context.push(...historyWithInsertions);
  }

  // Post-history instructions: character's PHI, then user PHI
  if (charPostHistoryInstructions) {
    context.push({ role: 'system', content: charPostHistoryInstructions });
  }
  if (userPHI) {
    context.push({ role: 'system', content: userPHI });
  }

  // World info 'after_an' entries go after post-history instructions
  const wiAfterAn = joinWi(wiByPosition.after_an);
  if (wiAfterAn) {
    context.push({ role: 'system', content: wiAfterAn });
  }

  // If not token-aware, still estimate tokens for the UI badge
  if (!ctxConfig.tokenAware) {
    genState.setLastTokenEstimate(
      estimateConversationTokens(context, tokenProfile)
    );
  }

  return context;
}

// Build conversation context for group chat AI
function buildGroupConversationContext(
  messages: ChatMessage[],
  characters: CharacterInfo[],
  currentCharacter: CharacterInfo,
  scenarioOverride?: string
): { role: 'user' | 'assistant' | 'system'; content: string }[] {
  const context: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

  const characterDescriptions = characters.map((char) => {
    const details = [
      char.description && `Description: ${char.description}`,
      char.personality && `Personality: ${char.personality}`,
    ].filter(Boolean).join(' ');
    return `- ${char.name}: ${details || 'A character in the conversation'}`;
  }).join('\n');

  // Resolve scenario: override wins, else falls back to current character's
  // scenario. Macros are processed on the override, but {{char}} is ambiguous
  // in a group (multiple speakers), so we scrub char-specific substitutions
  // by passing an empty charName + character fields.
  let scenarioText = '';
  if (scenarioOverride && scenarioOverride.trim()) {
    const persona = usePersonaStore
      .getState()
      .getPersonaForContext(currentCharacter.avatar);
    const personaName = persona?.name || 'You';
    const { activeModel } = useSettingsStore.getState();
    scenarioText = processMacros(scenarioOverride, {
      charName: '',
      userName: personaName,
      personaName,
      personaDescription: persona?.description || '',
      characterDescription: '',
      characterPersonality: '',
      characterScenario: '',
      lastMessage: '',
      lastUserMessage: '',
      lastCharMessage: '',
      model: activeModel,
    }).trim();
  } else {
    scenarioText =
      currentCharacter.scenario || currentCharacter.data?.scenario || '';
  }

  const systemPrompt = `This is a group chat with multiple characters. You are playing ${currentCharacter.name}.

Characters in this conversation:
${characterDescriptions}

${scenarioText ? `Current scenario: ${scenarioText}\n` : ''}
IMPORTANT:
- Stay in character as ${currentCharacter.name}
- React naturally to what other characters and the user say
- Begin your response with an emotion tag: [emotion:TAG]
- Available emotions: neutral, joy, sadness, anger, surprise, fear, love, excitement, confusion, embarrassment, curiosity, amusement
- You may interact with or respond to other characters, not just the user`;

  context.push({ role: 'system', content: systemPrompt });

  // Phase 8.1: Author's Note for group chats
  const { currentChatFile: groupChatFile } = useChatStore.getState();
  const groupAuthorNote = groupChatFile
    ? useChatStore.getState().getAuthorNote(groupChatFile)
    : null;

  const recentMessages = messages.slice(-30).filter((m) => !m.isSystem);
  for (let i = 0; i < recentMessages.length; i++) {
    const msg = recentMessages[i];
    const depthFromEnd = recentMessages.length - i;

    // Inject author's note at the configured depth
    if (groupAuthorNote && depthFromEnd === groupAuthorNote.depth) {
      context.push({
        role: groupAuthorNote.role,
        content: groupAuthorNote.content,
      });
    }

    const contentWithName = msg.isUser
      ? msg.content
      : `[${msg.name}]: ${msg.content}`;
    context.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: contentWithName,
    });
  }

  // If depth exceeds history, prepend
  if (groupAuthorNote && groupAuthorNote.depth > recentMessages.length) {
    // Insert after the system prompt (index 1)
    context.splice(1, 0, {
      role: groupAuthorNote.role,
      content: groupAuthorNote.content,
    });
  }

  return context;
}

// Phase 5.2: shared helper that runs a single group-chat turn (build context,
// call API, stream, finalize). Both `sendGroupMessage` and `forceGroupMemberTalk`
// delegate to this to avoid drift in the streaming + parsing path. Returns
// `false` if the turn was aborted or never produced a stream, `true` otherwise.
async function generateGroupTurn(
  character: CharacterInfo,
  characters: CharacterInfo[],
  scenarioOverride: string | undefined,
  abortController: AbortController,
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  images?: GenerationImage[]
): Promise<boolean> {
  // Surface this speaker to the typing indicator before the API call so the
  // "X is typing..." row shows during the request, not just after the first
  // token. Reset isStreaming so the indicator isn't masked by the prior
  // speaker's tail streaming state.
  set({ isStreaming: false, currentSpeakerName: character.name });

  const { provider, model } = getProviderAndModel();
  const updatedMessages = get().messages;
  const context = buildGroupConversationContext(
    updatedMessages,
    characters,
    character,
    scenarioOverride
  );

  const finalContext = maybeApplyInstructMode(context);
  const stream = await api.generateMessage(
    finalContext,
    character.name,
    provider,
    model,
    abortController.signal,
    getGenerationOptions(),
    images
  );

  if (!stream) return false;

  const aiMessageId = generateId();
  set((state) => ({
    messages: [
      ...state.messages,
      {
        id: aiMessageId,
        name: character.name,
        isUser: false,
        isSystem: false,
        content: '',
        timestamp: Date.now(),
        characterAvatar: character.avatar,
        swipes: [''],
        swipeId: 0,
      },
    ],
  }));

  let responseText = '';
  for await (const token of parseSSEStream(stream)) {
    if (!get().isSending) break;
    responseText += token;
    if (!get().isStreaming) set({ isStreaming: true });
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === aiMessageId
          ? { ...msg, content: responseText, swipes: [responseText] }
          : msg
      ),
    }));
  }

  const emotion = parseEmotion(responseText);
  const cleanedContent = stripEmotionTag(responseText);

  set((state) => ({
    messages: state.messages.map((msg) =>
      msg.id === aiMessageId
        ? { ...msg, content: cleanedContent, emotion, swipes: [cleanedContent] }
        : msg
    ),
  }));

  return get().isSending;
}

// Helper: get provider/model with auto-switch
function getProviderAndModel(): { provider: string; model: string } {
  const { activeProvider, activeModel, secrets } = useSettingsStore.getState();

  let provider = activeProvider;
  let model = activeModel;

  if (!provider || provider === 'openai') {
    const hasOpenAI = Array.isArray(secrets['api_key_openai']) && secrets['api_key_openai'].length > 0;
    const hasClaude = Array.isArray(secrets['api_key_claude']) && secrets['api_key_claude'].length > 0;
    if (!hasOpenAI && hasClaude) {
      provider = 'claude';
      model = 'claude-sonnet-4-20250514';
      useSettingsStore.setState({ activeProvider: provider, activeModel: model });
    }
  }

  return { provider, model };
}

// Helper: build generation options from the current sampler + instruct config.
function getGenerationOptions(): GenerationOptions {
  const { sampler, instruct } = useGenerationStore.getState();
  const combinedStops = [...sampler.stopStrings];

  if (instruct.enabled) {
    const tpl = getInstructTemplate(instruct.templateId);
    if (tpl) {
      for (const s of tpl.stopStrings) {
        if (!combinedStops.includes(s)) combinedStops.push(s);
      }
    }
    for (const s of instruct.extraStopStrings) {
      if (s && !combinedStops.includes(s)) combinedStops.push(s);
    }
  }

  return {
    temperature: sampler.temperature,
    maxTokens: sampler.maxTokens,
    topP: sampler.topP,
    topK: sampler.topK,
    minP: sampler.minP,
    frequencyPenalty: sampler.frequencyPenalty,
    presencePenalty: sampler.presencePenalty,
    repetitionPenalty: sampler.repetitionPenalty,
    stopStrings: combinedStops,
  };
}

// Helper: optionally convert message array into a single instruct-mode message
// when instruct mode is enabled. The backend still expects chat-completion-style
// messages, so we wrap the formatted prompt as a single user message.
function maybeApplyInstructMode(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
): { role: 'user' | 'assistant' | 'system'; content: string }[] {
  const { instruct } = useGenerationStore.getState();
  if (!instruct.enabled) return messages;
  const tpl = getInstructTemplate(instruct.templateId);
  if (!tpl) return messages;

  const prompt = formatInstructPrompt(messages, tpl);
  return [{ role: 'user', content: prompt }];
}

// Helper: save chat to backend
async function saveChatToBackend(
  messages: ChatMessage[],
  character: CharacterInfo,
  currentChatFile: string | null,
  isGroupChat?: boolean,
  groupCharacters?: CharacterInfo[]
) {
  if (!currentChatFile) return;

  // Phase 8.1: include author's note in chat header metadata
  const authorNote = currentChatFile
    ? useChatStore.getState().getAuthorNote(currentChatFile)
    : null;

  const chatData = [
    {
      user_name: 'You',
      character_name: isGroupChat && groupCharacters
        ? groupCharacters.map(c => c.name).join(', ')
        : character.name,
      create_date: new Date().toISOString(),
      ...(isGroupChat ? { is_group_chat: true } : {}),
      ...(authorNote ? {
        author_note: {
          content: authorNote.content,
          depth: authorNote.depth,
          role: authorNote.role,
        },
      } : {}),
    },
    ...messages.map((msg) => ({
      name: msg.name,
      is_user: msg.isUser,
      is_system: msg.isSystem,
      mes: msg.content,
      send_date: msg.timestamp,
      swipes: msg.swipes,
      swipe_id: msg.swipeId,
      ...(msg.characterAvatar ? { character_avatar: msg.characterAvatar } : {}),
      // Phase 6.1: persist image attachments into extra.images (array) and
      // extra.image (first element, SillyTavern-compat fallback for any
      // code path that still reads the scalar form).
      ...(msg.images && msg.images.length > 0
        ? {
            extra: {
              images: msg.images,
              image: msg.images[0],
            },
          }
        : {}),
    })),
  ];

  const avatarUrl = isGroupChat && groupCharacters
    ? groupCharacters[0].avatar
    : character.avatar;

  try {
    await api.saveChat(avatarUrl, currentChatFile, chatData);
  } catch (err) {
    console.error('[Chat] Failed to save:', err);
  }
}

// Helper: create a message with swipe defaults
function createMessage(data: Omit<ChatMessage, 'id' | 'swipes' | 'swipeId'>): ChatMessage {
  return {
    ...data,
    id: generateId(),
    swipes: [data.content],
    swipeId: 0,
  };
}

/** Phase 6.1: convert stored data-URL images into the provider-neutral
 *  `{mimeType, base64}` form the API client expects. Malformed entries
 *  are silently dropped — callers already staged valid data URLs. */
function resolveImagesForSend(
  images: string[] | undefined
): GenerationImage[] | undefined {
  if (!images || images.length === 0) return undefined;
  const parts: GenerationImage[] = [];
  for (const url of images) {
    const part = dataUrlToPart(url);
    if (part) parts.push(part);
  }
  return parts.length > 0 ? parts : undefined;
}

/** Phase 6.1: pull the most recent user message's images from a history
 *  so follow-up generations (swipe/regen/continue/edit-and-regen) keep the
 *  multimodal attachment in play even when the caller didn't pass images
 *  directly. Returns undefined if the model can't see images or the last
 *  user message has none. */
function imagesFromLastUserMessage(
  messages: ChatMessage[],
  provider: string,
  model: string
): GenerationImage[] | undefined {
  if (!supportsVision(provider, model)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.isUser) continue;
    return resolveImagesForSend(m.images);
  }
  return undefined;
}

/** Reset streaming flags in a `finally` block only when the local controller
 *  is still the active one. Prevents a slow-unwinding generator from wiping
 *  the state of a newer operation the user kicked off (e.g. stop → force-talk
 *  in quick succession). */
function resetStreamingStateIfOwner(
  localController: AbortController,
  get: () => ChatState,
  set: (partial: Partial<ChatState>) => void
) {
  if (get().abortController === localController) {
    set({
      isSending: false,
      isStreaming: false,
      abortController: null,
      currentSpeakerName: null,
    });
  }
}

// Helper: normalize loaded messages to always have swipes
function normalizeMessage(msg: {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  send_date: number;
  swipes?: string[];
  swipe_id?: number;
  character_avatar?: string;
  // Phase 6.1: vision attachments persisted via extra.images (our field)
  // with a fallback to extra.image (single-item, SillyTavern-compat).
  extra?: {
    images?: unknown;
    image?: unknown;
    [key: string]: unknown;
  };
}): ChatMessage {
  const content = msg.swipes && msg.swipe_id !== undefined
    ? msg.swipes[msg.swipe_id] ?? msg.mes
    : msg.mes;

  // Recover image attachments. Array form wins; scalar `extra.image`
  // (SillyTavern single-image legacy) is promoted to a 1-element array.
  let images: string[] | undefined;
  const rawImages = msg.extra?.images;
  if (Array.isArray(rawImages)) {
    const arr = rawImages.filter(
      (x): x is string => typeof x === 'string' && x.startsWith('data:')
    );
    if (arr.length > 0) images = arr;
  } else if (typeof msg.extra?.image === 'string' && msg.extra.image.startsWith('data:')) {
    images = [msg.extra.image];
  }

  return {
    id: generateId(),
    name: msg.name,
    isUser: msg.is_user,
    isSystem: msg.is_system,
    content,
    timestamp: msg.send_date,
    swipes: msg.swipes && msg.swipes.length > 0 ? msg.swipes : [msg.mes],
    swipeId: msg.swipe_id ?? 0,
    characterAvatar: msg.character_avatar,
    images,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  chatFiles: [],
  groupChats: loadGroupChatsFromStorage(),
  currentChatFile: null,
  isLoading: false,
  isSending: false,
  isStreaming: false,
  error: null,
  abortController: null,
  currentSpeakerName: null,

  // Phase 8.1: Author's Note
  authorNotes: loadAuthorNotesFromStorage(),

  getAuthorNote: (fileName: string) => {
    const note = get().authorNotes[fileName];
    if (!note || !note.content?.trim()) return null;
    return note;
  },

  setAuthorNote: (fileName: string, partial: Partial<AuthorNote>) => {
    const { authorNotes } = get();
    const existing = authorNotes[fileName] || { content: '', depth: 4, role: 'system' as const };
    const updated = {
      ...authorNotes,
      [fileName]: {
        content: partial.content ?? existing.content,
        depth: partial.depth ?? existing.depth,
        role: partial.role ?? existing.role,
      },
    };
    saveAuthorNotesToStorage(updated);
    set({ authorNotes: updated });
  },

  refreshGroupChats: () => {
    set({ groupChats: loadGroupChatsFromStorage() });
  },

  deleteGroupChat: (fileName: string) => {
    const { groupChats } = get();
    const updated = groupChats.filter((g) => g.fileName !== fileName);
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  // ---- Phase 5.1: activation strategies + mute ----
  getGroupChatByFile: (fileName: string) => {
    return get().groupChats.find((g) => g.fileName === fileName) || null;
  },

  setGroupActivationStrategy: (fileName, strategy) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName ? { ...g, activationStrategy: strategy } : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  toggleGroupMute: (fileName, avatar) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) => {
      if (g.fileName !== fileName) return g;
      const muted = new Set(g.mutedAvatars);
      if (muted.has(avatar)) muted.delete(avatar);
      else muted.add(avatar);
      return { ...g, mutedAvatars: Array.from(muted) };
    });
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  setGroupPooledExcludeRecent: (fileName, n) => {
    const clamped = Math.max(0, Math.floor(n));
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName ? { ...g, pooledExcludeRecent: clamped } : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  // ---- Phase 5.2: auto-mode, reorder, scenario override ----
  setGroupAutoMode: (fileName, enabled) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName ? { ...g, autoModeEnabled: enabled } : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  setGroupAutoModeDelay: (fileName, delayMs) => {
    const clamped = Math.max(0, Math.floor(delayMs));
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName ? { ...g, autoModeDelayMs: clamped } : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  setGroupScenarioOverride: (fileName, scenario) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName ? { ...g, scenarioOverride: scenario } : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  reorderGroupMembers: (fileName, avatars) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) => {
      if (g.fileName !== fileName) return g;
      // Reorder characterAvatars + characterNames in lockstep. Skip any avatar
      // in the payload that isn't in the record, and preserve any existing
      // members missing from the payload by appending them in original order.
      const oldAvatars = g.characterAvatars;
      const oldNames = g.characterNames;
      const nameByAvatar = new Map<string, string>();
      oldAvatars.forEach((a, i) => nameByAvatar.set(a, oldNames[i] ?? ''));
      const validAvatars = avatars.filter((a) => nameByAvatar.has(a));
      const missing = oldAvatars.filter((a) => !validAvatars.includes(a));
      const nextAvatars = [...validAvatars, ...missing];
      const nextNames = nextAvatars.map((a) => nameByAvatar.get(a) ?? '');
      return {
        ...g,
        characterAvatars: nextAvatars,
        characterNames: nextNames,
      };
    });
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  // ---- Phase 5.3: per-member talkativeness, title, live add/remove ----
  setGroupTalkativenessOverride: (fileName, avatar, value) => {
    const { groupChats } = get();
    const updated = groupChats.map((g) => {
      if (g.fileName !== fileName) return g;
      const nextOverrides = { ...(g.talkativenessOverrides || {}) };
      if (value === null || typeof value !== 'number' || !isFinite(value)) {
        delete nextOverrides[avatar];
      } else {
        const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
        nextOverrides[avatar] = clamped;
      }
      return { ...g, talkativenessOverrides: nextOverrides };
    });
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  setGroupTitle: (fileName, title) => {
    const trimmed = title.trim();
    const { groupChats } = get();
    const updated = groupChats.map((g) =>
      g.fileName === fileName
        ? { ...g, title: trimmed.length > 0 ? trimmed : undefined }
        : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  addGroupChatMember: (fileName, character) => {
    const { groupChats, messages } = get();
    const existing = groupChats.find((g) => g.fileName === fileName);
    if (!existing) return;
    if (existing.characterAvatars.includes(character.avatar)) return;

    // Persist roster change.
    const updated = groupChats.map((g) =>
      g.fileName === fileName
        ? {
            ...g,
            characterNames: [...g.characterNames, character.name],
            characterAvatars: [...g.characterAvatars, character.avatar],
          }
        : g
    );
    saveGroupChatsToStorage(updated);

    // Post greeting so the new member exists in context before being asked
    // to speak. Use first_mes when available, otherwise a neutral join marker.
    const firstMes = character.first_mes || character.data?.first_mes || '';
    const greeting: ChatMessage = firstMes.trim()
      ? createMessage({
          name: character.name,
          isUser: false,
          isSystem: false,
          content: firstMes,
          timestamp: Date.now(),
          characterAvatar: character.avatar,
        })
      : createMessage({
          name: 'System',
          isUser: false,
          isSystem: true,
          content: `${character.name} joined the chat.`,
          timestamp: Date.now(),
        });

    set({
      groupChats: updated,
      messages: [...messages, greeting],
    });
  },

  removeGroupChatMember: (fileName, avatar) => {
    const { groupChats } = get();
    const existing = groupChats.find((g) => g.fileName === fileName);
    if (!existing) return;
    if (!existing.characterAvatars.includes(avatar)) return;
    // Refuse if removing would drop the group below 2 members — a group of 1
    // is indistinguishable from a solo chat and breaks several assumptions.
    if (existing.characterAvatars.length <= 2) return;

    const idx = existing.characterAvatars.indexOf(avatar);
    const nextAvatars = existing.characterAvatars.filter((_, i) => i !== idx);
    const nextNames = existing.characterNames.filter((_, i) => i !== idx);
    const nextMuted = existing.mutedAvatars.filter((a) => a !== avatar);
    const nextOverrides = { ...(existing.talkativenessOverrides || {}) };
    delete nextOverrides[avatar];

    const updated = groupChats.map((g) =>
      g.fileName === fileName
        ? {
            ...g,
            characterAvatars: nextAvatars,
            characterNames: nextNames,
            mutedAvatars: nextMuted,
            talkativenessOverrides: nextOverrides,
          }
        : g
    );
    saveGroupChatsToStorage(updated);
    set({ groupChats: updated });
  },

  fetchChatFiles: async (avatarUrl: string) => {
    set({ isLoading: true, error: null });
    try {
      const chats = await api.getChats(avatarUrl);
      const chatFiles: ChatFile[] = chats.map((chat) => ({
        fileName: chat.file_name?.replace(/\.jsonl$/, '') || chat.file_name,
        fileSize: chat.file_size,
        lastMessage: chat.last_mes,
      }));
      set({ chatFiles, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch chats',
      });
    }
  },

  loadChat: async (avatarUrl: string, fileName: string) => {
    set({ isLoading: true, error: null, currentChatFile: fileName });
    try {
      const rawMessages = await api.getChatMessages(avatarUrl, fileName);
      const messages = rawMessages.map(normalizeMessage);
      set({ messages, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load chat',
      });
    }
  },

  loadGroupChat: async (groupChat: GroupChatInfo) => {
    set({ isLoading: true, error: null, currentChatFile: groupChat.fileName });
    try {
      const avatarUrl = groupChat.characterAvatars[0];
      const rawMessages = await api.getChatMessages(avatarUrl, groupChat.fileName);
      const messages = rawMessages.map(normalizeMessage);
      set({ messages, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load group chat',
      });
    }
  },

  startNewChat: async (character: CharacterInfo) => {
    const messages: ChatMessage[] = [];

    const firstMes = character.first_mes || character.data?.first_mes || '';
    const altGreetings = getAlternateGreetings(character);

    if (firstMes || altGreetings.length > 0) {
      // Build swipes array: primary greeting + alternate greetings
      const swipes = [firstMes, ...altGreetings].filter(Boolean);
      const firstMessage = createMessage({
        name: character.name,
        isUser: false,
        isSystem: false,
        content: swipes[0] || '',
        timestamp: Date.now(),
        characterAvatar: character.avatar,
      });
      // Override the swipes to include all greetings
      firstMessage.swipes = swipes;
      firstMessage.swipeId = 0;
      messages.push(firstMessage);
    }

    const fileName = await api.createChat(character.name);
    set({ messages, currentChatFile: fileName, error: null });
  },

  startNewGroupChat: async (characters: CharacterInfo[]) => {
    const messages: ChatMessage[] = [];

    messages.push(createMessage({
      name: 'System',
      isUser: false,
      isSystem: true,
      content: `Group chat started with ${characters.map(c => c.name).join(', ')}`,
      timestamp: Date.now(),
    }));

    for (const character of characters) {
      const firstMes = character.first_mes || character.data?.first_mes || '';
      const altGreetings = getAlternateGreetings(character);
      if (firstMes || altGreetings.length > 0) {
        const swipes = [firstMes, ...altGreetings].filter(Boolean);
        const message = createMessage({
          name: character.name,
          isUser: false,
          isSystem: false,
          content: swipes[0] || '',
          timestamp: Date.now() + characters.indexOf(character),
          characterAvatar: character.avatar,
        });
        message.swipes = swipes;
        message.swipeId = 0;
        messages.push(message);
      }
    }

    const groupName = `Group_${characters.map(c => c.name).join('_')}`;
    const fileName = await api.createChat(groupName);

    const { groupChats } = get();
    const newGroupChat: GroupChatInfo = {
      fileName,
      characterNames: characters.map((c) => c.name),
      characterAvatars: characters.map((c) => c.avatar),
      lastMessage: messages[messages.length - 1]?.content || '',
      createdAt: Date.now(),
      activationStrategy: DEFAULT_GROUP_ACTIVATION_STRATEGY,
      mutedAvatars: [],
      pooledExcludeRecent: DEFAULT_POOLED_EXCLUDE_RECENT,
      autoModeEnabled: false,
      autoModeDelayMs: DEFAULT_AUTO_MODE_DELAY_MS,
      scenarioOverride: '',
      talkativenessOverrides: {},
      title: undefined,
    };
    const updatedGroupChats = [...groupChats, newGroupChat];
    saveGroupChatsToStorage(updatedGroupChats);

    set({
      messages,
      currentChatFile: fileName,
      groupChats: updatedGroupChats,
      error: null,
    });
  },

  addMessage: (message) => {
    const newMessage = createMessage(message);
    set((state) => ({ messages: [...state.messages, newMessage] }));
  },

  // ---- Stop Generation ----
  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    // Clear abortController + sending flags synchronously so the next action
    // (e.g. force-talk after stop) sees clean state immediately. The in-flight
    // generation's `finally` block guards against trampling a newer controller.
    set({
      isSending: false,
      isStreaming: false,
      abortController: null,
      currentSpeakerName: null,
    });
  },

  // ---- Edit Message (save only, no regeneration) ----
  editMessage: (messageId: string, newContent: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const newSwipes = [...msg.swipes];
        newSwipes[msg.swipeId] = newContent;
        return { ...msg, content: newContent, swipes: newSwipes };
      }),
    }));
  },

  // ---- Delete Message ----
  deleteMessage: (messageId: string) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== messageId),
    }));
  },

  // ---- Swipe Left (previous swipe) ----
  swipeLeft: (messageId: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId || msg.swipeId <= 0) return msg;
        const newSwipeId = msg.swipeId - 1;
        return { ...msg, swipeId: newSwipeId, content: msg.swipes[newSwipeId] };
      }),
    }));
  },

  // ---- Swipe Right (next swipe, or generate new if at end) ----
  swipeRight: async (messageId: string, character: CharacterInfo, availableEmotions?: string[]) => {
    const { messages } = get();
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    // If there's a next swipe, just navigate to it
    if (msg.swipeId < msg.swipes.length - 1) {
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId) return m;
          const newSwipeId = m.swipeId + 1;
          return { ...m, swipeId: newSwipeId, content: m.swipes[newSwipeId] };
        }),
      }));
      return;
    }

    // Generate a new swipe
    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      // Build context from messages up to (but not including) this AI message
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      const contextMessages = messages.slice(0, msgIndex);
      const context = buildConversationContext(contextMessages, character, availableEmotions);
      const { provider, model } = getProviderAndModel();

      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(
        finalContext,
        character.name,
        provider,
        model,
        abortController.signal,
        getGenerationOptions(),
        imagesFromLastUserMessage(contextMessages, provider, model)
      );
      if (!stream) return;

      // Add new empty swipe
      const newSwipeIndex = msg.swipes.length;
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId) return m;
          return { ...m, swipes: [...m.swipes, ''], swipeId: newSwipeIndex, content: '' };
        }),
      }));

      let responseText = '';
      for await (const token of parseSSEStream(stream)) {
        if (!get().isSending) break; // Aborted
        responseText += token;
        if (!get().isStreaming) set({ isStreaming: true });
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== messageId) return m;
            const newSwipes = [...m.swipes];
            newSwipes[newSwipeIndex] = responseText;
            return { ...m, content: responseText, swipes: newSwipes };
          }),
        }));
      }

      const emotion = parseEmotion(responseText);
      const cleanedContent = stripEmotionTag(responseText);

      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== messageId) return m;
          const newSwipes = [...m.swipes];
          newSwipes[newSwipeIndex] = cleanedContent;
          return { ...m, content: cleanedContent, emotion, swipes: newSwipes };
        }),
      }));

      // Save
      const { currentChatFile } = get();
      await saveChatToBackend(get().messages, character, currentChatFile);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to generate swipe' });
      }
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
    }
  },

  // ---- Regenerate (create new swipe on last AI message) ----
  regenerateMessage: async (character: CharacterInfo, availableEmotions?: string[]) => {
    const { messages } = get();
    // Find last AI message
    const lastAiMsg = [...messages].reverse().find((m) => !m.isUser && !m.isSystem);
    if (!lastAiMsg) return;
    await get().swipeRight(lastAiMsg.id, character, availableEmotions);
  },

  // ---- Continue (extend last AI message) ----
  continueMessage: async (character: CharacterInfo, availableEmotions?: string[]) => {
    const { messages } = get();
    const lastAiMsg = [...messages].reverse().find((m) => !m.isUser && !m.isSystem);
    if (!lastAiMsg) return;

    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      // Build context including the current AI message
      const context = buildConversationContext(messages, character, availableEmotions);
      // Add a system instruction to continue
      context.push({
        role: 'system',
        content: 'Continue your previous response naturally. Do not repeat what you already said. Pick up exactly where you left off.',
      });

      const { provider, model } = getProviderAndModel();
      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(
        finalContext,
        character.name,
        provider,
        model,
        abortController.signal,
        getGenerationOptions(),
        imagesFromLastUserMessage(messages, provider, model)
      );
      if (!stream) return;

      const existingContent = lastAiMsg.content;
      let newTokens = '';

      for await (const token of parseSSEStream(stream)) {
        if (!get().isSending) break;
        newTokens += token;
        if (!get().isStreaming) set({ isStreaming: true });
        const fullContent = existingContent + newTokens;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== lastAiMsg.id) return m;
            const newSwipes = [...m.swipes];
            newSwipes[m.swipeId] = fullContent;
            return { ...m, content: fullContent, swipes: newSwipes };
          }),
        }));
      }

      // Strip any new emotion tags from the continuation
      const fullText = existingContent + newTokens;
      const cleanedContent = stripEmotionTag(fullText);

      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== lastAiMsg.id) return m;
          const newSwipes = [...m.swipes];
          newSwipes[m.swipeId] = cleanedContent;
          return { ...m, content: cleanedContent, swipes: newSwipes };
        }),
      }));

      const { currentChatFile } = get();
      await saveChatToBackend(get().messages, character, currentChatFile);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to continue message' });
      }
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
    }
  },

  // ---- Impersonate (generate as user, return text without sending) ----
  impersonate: async (character: CharacterInfo, availableEmotions?: string[]): Promise<string> => {
    const { messages } = get();
    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      const context = buildConversationContext(messages, character, availableEmotions);
      // Replace the system prompt's last line to instruct impersonation
      context.push({
        role: 'system',
        content: `Now write the next message as the user (You). Write from a first-person perspective as the user would. Do NOT include an emotion tag. Do NOT write as ${character.name}.`,
      });

      const { provider, model } = getProviderAndModel();
      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());
      if (!stream) return '';

      let responseText = '';
      for await (const token of parseSSEStream(stream)) {
        if (!get().isSending) break;
        responseText += token;
        if (!get().isStreaming) set({ isStreaming: true });
      }

      return stripEmotionTag(responseText);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to impersonate' });
      }
      return '';
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
    }
  },

  // ---- Delete Chat File ----
  deleteChat: async (avatarUrl: string, fileName: string) => {
    try {
      // Save an empty chat to effectively delete it
      await api.saveChat(avatarUrl, fileName, []);
      // Refresh chat list
      const { fetchChatFiles } = get();
      await fetchChatFiles(avatarUrl);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete chat' });
    }
  },

  // ---- Send Message (updated with abort support) ----
  sendMessage: async (
    content: string,
    character: CharacterInfo,
    availableEmotions?: string[],
    images?: string[]
  ) => {
    const { addMessage } = get();

    // Phase 6.1: non-vision model guard. Refuse to send images to a model
    // that can't read them — otherwise the backend turns the content-part
    // payload into an opaque 400/500. The user-facing message still posts
    // (minus attachments) so the user can retry after switching models.
    const { provider, model } = getProviderAndModel();
    let attachedImages = images;
    let visionError: string | null = null;
    if (attachedImages && attachedImages.length > 0 && !supportsVision(provider, model)) {
      visionError = `${model || provider || 'This model'} can't see images. Switch to a vision-capable model (GPT-4o, Claude 3+, Gemini) to send attachments.`;
      attachedImages = undefined;
    }

    addMessage({
      name: 'You',
      isUser: true,
      isSystem: false,
      content,
      timestamp: Date.now(),
      images: attachedImages,
    });

    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: visionError, abortController });

    try {
      const updatedMessages = get().messages;
      const context = buildConversationContext(updatedMessages, character, availableEmotions);

      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(
        finalContext,
        character.name,
        provider,
        model,
        abortController.signal,
        getGenerationOptions(),
        resolveImagesForSend(attachedImages)
      );

      if (stream) {
        const aiMessageId = generateId();
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: aiMessageId,
              name: character.name,
              isUser: false,
              isSystem: false,
              content: '',
              timestamp: Date.now(),
              swipes: [''],
              swipeId: 0,
            },
          ],
        }));

        let responseText = '';
        for await (const token of parseSSEStream(stream)) {
          if (!get().isSending) break;
          responseText += token;
          if (!get().isStreaming) set({ isStreaming: true });
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: responseText, swipes: [responseText] } : msg
            ),
          }));
        }

        const emotion = parseEmotion(responseText);
        const cleanedContent = stripEmotionTag(responseText);

        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: cleanedContent, emotion, swipes: [cleanedContent] }
              : msg
          ),
        }));

        const { currentChatFile } = get();
        await saveChatToBackend(get().messages, character, currentChatFile);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to send message' });
      }
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
    }
  },

  // ---- Send Group Message (updated with abort support) ----
  sendGroupMessage: async (
    content: string,
    characters: CharacterInfo[],
    images?: string[]
  ) => {
    const { addMessage, currentChatFile, getGroupChatByFile } = get();

    // Phase 6.1: non-vision model guard — same as single-character send.
    const { provider, model } = getProviderAndModel();
    let attachedImages = images;
    let visionError: string | null = null;
    if (
      attachedImages &&
      attachedImages.length > 0 &&
      !supportsVision(provider, model)
    ) {
      visionError = `${model || provider || 'This model'} can't see images. Switch to a vision-capable model (GPT-4o, Claude 3+, Gemini) to send attachments.`;
      attachedImages = undefined;
    }

    addMessage({
      name: 'You',
      isUser: true,
      isSystem: false,
      content,
      timestamp: Date.now(),
      images: attachedImages,
    });

    if (visionError) {
      set({ error: visionError });
    }

    // Resolve strategy + mute from the persisted group chat record. Missing
    // record (very old group chats not reloaded) falls back to list order
    // with no mutes so the legacy behavior still ships.
    const groupChat = currentChatFile ? getGroupChatByFile(currentChatFile) : null;
    const strategy: GroupActivationStrategy =
      groupChat?.activationStrategy ?? DEFAULT_GROUP_ACTIVATION_STRATEGY;
    const mutedAvatars = new Set(groupChat?.mutedAvatars ?? []);
    const pooledExcludeRecent =
      groupChat?.pooledExcludeRecent ?? DEFAULT_POOLED_EXCLUDE_RECENT;
    const autoModeEnabled = groupChat?.autoModeEnabled ?? false;
    const autoModeDelayMs =
      groupChat?.autoModeDelayMs ?? DEFAULT_AUTO_MODE_DELAY_MS;
    const scenarioOverride = groupChat?.scenarioOverride;
    const talkativenessOverrides = groupChat?.talkativenessOverrides;

    // Manual strategy: just post the user message and wait for force-talk.
    // Auto-mode is ignored when the strategy is manual — the user is in
    // full control.
    if (strategy === 'manual') {
      if (currentChatFile && characters.length > 0) {
        await saveChatToBackend(
          get().messages,
          characters[0],
          currentChatFile,
          true,
          characters
        );
      }
      return;
    }

    const activeCharacters = characters.filter((c) => !mutedAvatars.has(c.avatar));
    if (activeCharacters.length === 0) {
      set({ error: 'All group members are muted. Unmute someone to continue.' });
      return;
    }

    // Pick the initial speaker queue. List replays the legacy behavior
    // (everyone speaks once in order); natural/pooled pick one.
    const pickSpeakers = (): CharacterInfo[] => {
      if (strategy === 'list') return activeCharacters;
      if (strategy === 'natural') {
        const pick = selectNaturalOrderSpeaker(
          activeCharacters,
          get().messages,
          talkativenessOverrides
        );
        return pick ? [pick] : [];
      }
      if (strategy === 'pooled') {
        const pick = selectPooledOrderSpeaker(
          activeCharacters,
          get().messages,
          pooledExcludeRecent,
          talkativenessOverrides
        );
        return pick ? [pick] : [];
      }
      return [];
    };

    const initialQueue = pickSpeakers();
    if (initialQueue.length === 0) {
      set({ error: 'Could not select a speaker for this turn.' });
      return;
    }

    const abortController = new AbortController();
    // Preserve visionError from the pre-send guard — the turn is still
    // attempted (without images), but we keep the inline warning visible.
    set({
      isSending: true,
      isStreaming: false,
      error: visionError,
      abortController,
    });
    const resolvedImages = resolveImagesForSend(attachedImages);

    try {
      // Run the user-kicked turn(s) first, then loop while auto-mode is on
      // and the user hasn't stopped us. Each loop tick re-runs pickSpeakers:
      // for list-mode this still replays the whole roster each tick (that's
      // what list means — a single "turn" for list is all members speaking
      // once), and natural/pooled pick one speaker per tick.
      let queue: CharacterInfo[] = initialQueue;
      let isFirstTurn = true;
      while (queue.length > 0 && get().isSending) {
        for (const character of queue) {
          if (!get().isSending) break;
          // Only the first turn of the first tick gets images — subsequent
          // characters in the same round are responding to the prior speaker,
          // not to the user's attachment. (We'd re-send the same bytes to
          // each character otherwise.)
          const continued = await generateGroupTurn(
            character,
            characters,
            scenarioOverride,
            abortController,
            get,
            set,
            isFirstTurn ? resolvedImages : undefined
          );
          isFirstTurn = false;
          if (!continued) break;
        }

        if (!autoModeEnabled || !get().isSending) break;

        // Delay between auto-mode ticks. Poll isSending so stop breaks the
        // wait promptly rather than leaving a dangling timer.
        const delay = Math.max(0, autoModeDelayMs);
        if (delay > 0) {
          const start = Date.now();
          while (Date.now() - start < delay && get().isSending) {
            await new Promise((r) => setTimeout(r, Math.min(100, delay)));
          }
        }
        if (!get().isSending) break;
        queue = pickSpeakers();
      }

      // Save group chat
      const { currentChatFile: finalChatFile } = get();
      if (finalChatFile && characters.length > 0) {
        await saveChatToBackend(
          get().messages,
          characters[0],
          finalChatFile,
          true,
          characters
        );
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to send group message' });
      }
    } finally {
      resetStreamingStateIfOwner(abortController, get, set);
    }
  },

  // ---- Force Group Member Talk (Phase 5.2) ----
  // Makes the given member respond next, bypassing the activation strategy
  // and mute state for exactly one turn. Intended to be wired to per-member
  // "talk next" buttons in the group controls panel.
  forceGroupMemberTalk: async (
    character: CharacterInfo,
    characters: CharacterInfo[]
  ) => {
    if (get().isSending) return; // caller should also gate the button
    const { currentChatFile, getGroupChatByFile } = get();
    const groupChat = currentChatFile ? getGroupChatByFile(currentChatFile) : null;
    const scenarioOverride = groupChat?.scenarioOverride;

    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      const { provider, model } = getProviderAndModel();
      await generateGroupTurn(
        character,
        characters,
        scenarioOverride,
        abortController,
        get,
        set,
        imagesFromLastUserMessage(get().messages, provider, model)
      );

      const { currentChatFile: finalChatFile } = get();
      if (finalChatFile && characters.length > 0) {
        await saveChatToBackend(
          get().messages,
          characters[0],
          finalChatFile,
          true,
          characters
        );
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to force member to respond',
        });
      }
    } finally {
      resetStreamingStateIfOwner(abortController, get, set);
    }
  },

  // ---- Edit and Regenerate (updated) ----
  editMessageAndRegenerate: async (messageId: string, newContent: string, character: CharacterInfo, availableEmotions?: string[]) => {
    const { messages } = get();

    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Update the message and remove all messages after it
    const updatedMessages = messages.slice(0, messageIndex + 1).map((msg) =>
      msg.id === messageId ? { ...msg, content: newContent, swipes: [newContent], swipeId: 0 } : msg
    );

    const abortController = new AbortController();
    set({ messages: updatedMessages, isSending: true, isStreaming: false, error: null, abortController });

    try {
      const context = buildConversationContext(updatedMessages, character, availableEmotions);
      const { provider, model } = getProviderAndModel();

      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(
        finalContext,
        character.name,
        provider,
        model,
        abortController.signal,
        getGenerationOptions(),
        imagesFromLastUserMessage(updatedMessages, provider, model)
      );

      if (stream) {
        const aiMessageId = generateId();
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: aiMessageId,
              name: character.name,
              isUser: false,
              isSystem: false,
              content: '',
              timestamp: Date.now(),
              swipes: [''],
              swipeId: 0,
            },
          ],
        }));

        let responseText = '';
        for await (const token of parseSSEStream(stream)) {
          if (!get().isSending) break;
          responseText += token;
          if (!get().isStreaming) set({ isStreaming: true });
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: responseText, swipes: [responseText] } : msg
            ),
          }));
        }

        const emotion = parseEmotion(responseText);
        const cleanedContent = stripEmotionTag(responseText);

        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: cleanedContent, emotion, swipes: [cleanedContent] }
              : msg
          ),
        }));

        const { currentChatFile } = get();
        await saveChatToBackend(get().messages, character, currentChatFile);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to regenerate response' });
      }
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
    }
  },

  clearChat: () => set({ messages: [], chatFiles: [], currentChatFile: null }),
}));
