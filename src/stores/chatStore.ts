import { create } from 'zustand';
import { api, type CharacterInfo, type GenerationOptions } from '../api/client';
import { useSettingsStore } from './settingsStore';
import { usePersonaStore } from './personaStore';
import { useGenerationStore } from './generationStore';
import {
  useWorldInfoStore,
  scanMessagesForEntries,
  type WorldInfoPosition,
  type MatchedEntry,
} from './worldInfoStore';
import { parseEmotion, stripEmotionTag, type Emotion } from '../utils/emotions';
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
}

interface ChatFile {
  fileName: string;
  fileSize: number;
  lastMessage: string;
}

export interface GroupChatInfo {
  fileName: string;
  characterNames: string[];
  characterAvatars: string[];
  lastMessage: string;
  createdAt: number;
}

const GROUP_CHATS_KEY = 'sillytavern_group_chats';

function loadGroupChatsFromStorage(): GroupChatInfo[] {
  try {
    const stored = localStorage.getItem(GROUP_CHATS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveGroupChatsToStorage(groupChats: GroupChatInfo[]) {
  localStorage.setItem(GROUP_CHATS_KEY, JSON.stringify(groupChats));
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

  // Existing actions
  fetchChatFiles: (avatarUrl: string) => Promise<void>;
  loadChat: (avatarUrl: string, fileName: string) => Promise<void>;
  loadGroupChat: (groupChat: GroupChatInfo) => Promise<void>;
  startNewChat: (character: CharacterInfo) => Promise<void>;
  startNewGroupChat: (characters: CharacterInfo[]) => Promise<void>;
  addMessage: (message: Omit<ChatMessage, 'id' | 'swipes' | 'swipeId'>) => void;
  sendMessage: (content: string, character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  sendGroupMessage: (content: string, characters: CharacterInfo[]) => Promise<void>;
  editMessageAndRegenerate: (messageId: string, newContent: string, character: CharacterInfo, availableEmotions?: string[]) => Promise<void>;
  clearChat: () => void;
  refreshGroupChats: () => void;
  deleteGroupChat: (fileName: string) => void;

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

  // Scan active world info books for keyword matches against recent history
  const wiState = useWorldInfoStore.getState();
  const tokenProfile = profileForProvider(activeProvider);
  const matchedEntries = scanMessagesForEntries(
    wiState.books,
    wiState.activeBookIds,
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
  currentCharacter: CharacterInfo
): { role: 'user' | 'assistant' | 'system'; content: string }[] {
  const context: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

  const characterDescriptions = characters.map((char) => {
    const details = [
      char.description && `Description: ${char.description}`,
      char.personality && `Personality: ${char.personality}`,
    ].filter(Boolean).join(' ');
    return `- ${char.name}: ${details || 'A character in the conversation'}`;
  }).join('\n');

  const systemPrompt = `This is a group chat with multiple characters. You are playing ${currentCharacter.name}.

Characters in this conversation:
${characterDescriptions}

${currentCharacter.scenario ? `Current scenario: ${currentCharacter.scenario}\n` : ''}
IMPORTANT:
- Stay in character as ${currentCharacter.name}
- React naturally to what other characters and the user say
- Begin your response with an emotion tag: [emotion:TAG]
- Available emotions: neutral, joy, sadness, anger, surprise, fear, love, excitement, confusion, embarrassment, curiosity, amusement
- You may interact with or respond to other characters, not just the user`;

  context.push({ role: 'system', content: systemPrompt });

  const recentMessages = messages.slice(-30);
  for (const msg of recentMessages) {
    if (msg.isSystem) continue;
    const contentWithName = msg.isUser
      ? msg.content
      : `[${msg.name}]: ${msg.content}`;
    context.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: contentWithName,
    });
  }

  return context;
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

  const chatData = [
    {
      user_name: 'You',
      character_name: isGroupChat && groupCharacters
        ? groupCharacters.map(c => c.name).join(', ')
        : character.name,
      create_date: new Date().toISOString(),
      ...(isGroupChat ? { is_group_chat: true } : {}),
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
}): ChatMessage {
  const content = msg.swipes && msg.swipe_id !== undefined
    ? msg.swipes[msg.swipe_id] ?? msg.mes
    : msg.mes;
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

  refreshGroupChats: () => {
    set({ groupChats: loadGroupChatsFromStorage() });
  },

  deleteGroupChat: (fileName: string) => {
    const { groupChats } = get();
    const updated = groupChats.filter((g) => g.fileName !== fileName);
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
      // Use the first character's avatar to fetch the chat file
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
    set({ isSending: false, isStreaming: false, abortController: null });
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
      const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());
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
      const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());
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
  sendMessage: async (content: string, character: CharacterInfo, availableEmotions?: string[]) => {
    const { addMessage } = get();

    addMessage({
      name: 'You',
      isUser: true,
      isSystem: false,
      content,
      timestamp: Date.now(),
    });

    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      const updatedMessages = get().messages;
      const context = buildConversationContext(updatedMessages, character, availableEmotions);
      const { provider, model } = getProviderAndModel();

      const finalContext = maybeApplyInstructMode(context);
      const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());

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
  sendGroupMessage: async (content: string, characters: CharacterInfo[]) => {
    const { addMessage } = get();

    addMessage({
      name: 'You',
      isUser: true,
      isSystem: false,
      content,
      timestamp: Date.now(),
    });

    const abortController = new AbortController();
    set({ isSending: true, isStreaming: false, error: null, abortController });

    try {
      const { provider, model } = getProviderAndModel();

      for (const character of characters) {
        if (!get().isSending) break; // Check if aborted between characters

        const updatedMessages = get().messages;
        const context = buildGroupConversationContext(updatedMessages, characters, character);

        const finalContext = maybeApplyInstructMode(context);
        const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());

        if (stream) {
          const aiMessageId = generateId();
          set((state) => ({
            isStreaming: false,
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
        }
      }

      // Save group chat
      const { currentChatFile } = get();
      if (currentChatFile && characters.length > 0) {
        await saveChatToBackend(get().messages, characters[0], currentChatFile, true, characters);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: error instanceof Error ? error.message : 'Failed to send group message' });
      }
    } finally {
      set({ isSending: false, isStreaming: false, abortController: null });
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
      const stream = await api.generateMessage(finalContext, character.name, provider, model, abortController.signal, getGenerationOptions());

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
