import { useEffect, useRef, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { MessageSquare, Users, Settings2, Pencil, Square, Search, ChevronUp, ChevronDown, X, Check } from 'lucide-react';
import { useCharacterStore } from '../../stores/characterStore';
import { useChatStore } from '../../stores/chatStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatActionBar } from './ChatActionBar';
import { GroupChatControls } from './GroupChatControls';
import { AuthorNote } from './AuthorNote';
import { SummaryPanel } from './SummaryPanel';
import { BranchPanel } from './BranchPanel';
import { useBranchStore } from '../../stores/branchStore';
import { TypingIndicator } from './TypingIndicator';
import { ImageGenModal } from './ImageGenModal';
import { QuickReplyBar } from './QuickReplyBar';
import { useExtensionStore } from '../../stores/extensionStore';
import { useSummarizeStore } from '../../stores/summarizeStore';
import { useCharacterSprites } from '../../hooks/useCharacterSprites';
import {
  getExpressionThumbnailUrl,
  getDefaultAvatarUrl,
  type Emotion,
} from '../../utils/emotions';
import {
  compressImageFiles,
  ACCEPTED_IMAGE_MIMES,
} from '../../utils/images';
import { getTtsAutoRead } from '../../hooks/speechLanguage';
import { speakText } from '../../hooks/useSpeechSynthesis';
import {
  getChatLayoutMode,
  getAvatarShape,
  getChatFontSize,
  getChatMaxWidth,
  getVnMode,
  getVnBgForCharacter,
  setVnBgForCharacter,
  clearVnBgForCharacter,
  getVnBgGlobal,
  setVnBgGlobal,
  clearVnBgGlobal,
  getCostume,
  setCostume,
  clearCostume,
} from '../../hooks/displayPreferences';

export function ChatView() {
  const { selectedCharacter, isGroupChatMode, groupChatCharacters, exitGroupChat } = useCharacterStore();
  const {
    messages,
    isSending,
    isStreaming,
    error,
    sendMessage,
    sendGroupMessage,
    startNewChat,
    fetchChatFiles,
    loadChat,
    chatFiles,
    clearChat,
    editMessageAndRegenerate,
    editMessage,
    deleteMessage,
    swipeLeft,
    swipeRight,
    regenerateMessage,
    continueMessage,
    impersonate,
    stopGeneration,
    insertImageMessage,
    currentChatFile,
    currentSpeakerName,
    setGroupTitle,
  } = useChatStore();
  // Subscribe to the current group-chat record for title + strategy display.
  const groupChatRecord = useChatStore((s) =>
    isGroupChatMode && currentChatFile
      ? s.groupChats.find((g) => g.fileName === currentChatFile) || null
      : null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Whether the user is scrolled near the bottom (within 150px). */
  const isNearBottomRef = useRef(true);
  const lastCharacterRef = useRef<string | null>(null);

  // Phase 7.3: display preferences (read from localStorage on mount/render)
  const chatLayoutMode = getChatLayoutMode();
  const avatarShapePref = getAvatarShape();
  const chatFontSize = getChatFontSize();
  const chatMaxWidth = getChatMaxWidth();
  // Phase 6.4: VN mode (re-read on every render so settings changes take effect immediately)
  const isVnMode = getVnMode();

  const [failedExpressions, setFailedExpressions] = useState<Set<string>>(new Set());
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [prefillNonce, setPrefillNonce] = useState(0);
  const [showGroupControls, setShowGroupControls] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // Phase 6.1: drag-drop staging — data URLs to append to ChatInput's
  // attachment set, re-triggered by the nonce so identical payloads fire.
  const [droppedImages, setDroppedImages] = useState<string[]>([]);
  const [droppedImagesNonce, setDroppedImagesNonce] = useState(0);
  const [editLastNonce, setEditLastNonce] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  // Phase 7.1: image generation modal
  const [isImageGenOpen, setIsImageGenOpen] = useState(false);
  const dragCounter = useRef(0);

  // Phase 6.4: VN mode — background image and costume
  const [vnBg, setVnBgState] = useState<string | null>(null);
  const [activeCostume, setActiveCostumeState] = useState<string | null>(null);
  const [costumeInputVisible, setCostumeInputVisible] = useState(false);
  const [costumeDraft, setCostumeDraft] = useState('');
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Phase 8.6: checkpoint creation dialog
  const [checkpointMessageId, setCheckpointMessageId] = useState<string | null>(null);
  const [checkpointName, setCheckpointName] = useState('');
  const checkpointInputRef = useRef<HTMLInputElement>(null);
  const createBranch = useBranchStore((s) => s.createBranch);
  const loadBranchesForChat = useBranchStore((s) => s.loadBranchesForChat);

  // Phase 9.1: in-chat message search
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getSpritePath, availableEmotions } = useCharacterSprites(selectedCharacter?.avatar, activeCostume);

  const latestEmotion = useMemo(() => {
    const characterMessages = messages.filter((m) => !m.isUser && !m.isSystem);
    if (characterMessages.length === 0) return null;
    return characterMessages[characterMessages.length - 1].emotion ?? null;
  }, [messages]);

  // Find the last AI message id for swipe control display
  const lastAiMessageId = useMemo(() => {
    const aiMessages = messages.filter((m) => !m.isUser && !m.isSystem);
    return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].id : null;
  }, [messages]);

  const lastUserMessageId = useMemo(() => {
    const userMessages = messages.filter((m) => m.isUser);
    return userMessages.length > 0 ? userMessages[userMessages.length - 1].id : null;
  }, [messages]);

  const hasAiMessage = useMemo(
    () => messages.some((m) => !m.isUser && !m.isSystem),
    [messages]
  );

  // Phase 9.1: IDs of messages matching the search query (excludes system messages)
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter((m) => !m.isSystem && m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  // Messages to actually render — filtered when search is active
  const displayedMessages = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return messages;
    const matchSet = new Set(searchMatchIds);
    return messages.filter((m) => matchSet.has(m.id));
  }, [isSearchOpen, searchQuery, messages, searchMatchIds]);

  const getAvatarUrl = useCallback(
    (avatar: string, emotion?: Emotion | null) => {
      if (isGroupChatMode) return getDefaultAvatarUrl(avatar);
      if (emotion) {
        const spritePath = getSpritePath(emotion);
        if (spritePath) return spritePath;
      }
      return getExpressionThumbnailUrl(avatar, emotion ?? null);
    },
    [getSpritePath, isGroupChatMode]
  );

  const getFullImageUrl = useCallback(
    (avatar: string, emotion?: Emotion | null) => {
      const expressionKey = `${avatar}-${emotion}`;
      if (emotion && failedExpressions.has(expressionKey)) {
        return getDefaultAvatarUrl(avatar);
      }
      if (emotion) {
        const spritePath = getSpritePath(emotion);
        if (spritePath) return spritePath;
      }
      return getDefaultAvatarUrl(avatar);
    },
    [getSpritePath, failedExpressions]
  );

  // Phase 9.1: focus the search input when the bar opens
  useEffect(() => {
    if (!isSearchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [isSearchOpen]);

  // Phase 9.1: auto-navigate to first match when query changes
  useEffect(() => {
    setSearchMatchIndex(0);
    if (searchMatchIds.length > 0) {
      const messageId = searchMatchIds[0];
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedMessageId(messageId);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1200);
      // Delay scroll slightly to allow filtered list to render
      setTimeout(() => {
        messageRefsMap.current.get(messageId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    } else {
      setHighlightedMessageId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const navigateToMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatchIds.length === 0) return;
      const nextIdx = (searchMatchIndex + direction + searchMatchIds.length) % searchMatchIds.length;
      setSearchMatchIndex(nextIdx);
      const messageId = searchMatchIds[nextIdx];
      messageRefsMap.current.get(messageId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedMessageId(messageId);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 1200);
    },
    [searchMatchIds, searchMatchIndex]
  );

  const openSearch = useCallback(() => setIsSearchOpen(true), []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchMatchIndex(0);
    setHighlightedMessageId(null);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, []);

  // Phase 6.4: sync VN bg and costume when character changes
  useEffect(() => {
    if (selectedCharacter) {
      setVnBgState(getVnBgForCharacter(selectedCharacter.avatar) ?? getVnBgGlobal());
      setActiveCostumeState(getCostume(selectedCharacter.avatar));
    } else {
      setVnBgState(getVnBgGlobal());
      setActiveCostumeState(null);
    }
  }, [selectedCharacter?.avatar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 6.4: track the last 3 distinct AI speakers for VN group sprite layout
  const recentSpeakers = useMemo<string[]>(() => {
    if (!isGroupChatMode) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (let i = messages.length - 1; i >= 0 && result.length < 3; i--) {
      const m = messages[i];
      if (!m.isUser && !m.isSystem && m.characterAvatar && !seen.has(m.characterAvatar)) {
        seen.add(m.characterAvatar);
        result.push(m.characterAvatar);
      }
    }
    return result; // result[0] = most recent speaker
  }, [messages, isGroupChatMode]);

  useEffect(() => {
    if (!selectedCharacter) return;
    if (lastCharacterRef.current === selectedCharacter.avatar) return;

    clearChat();
    lastCharacterRef.current = selectedCharacter.avatar;
    setFailedExpressions(new Set());
    fetchChatFiles(selectedCharacter.avatar);
  }, [selectedCharacter, fetchChatFiles, clearChat]);

  useEffect(() => {
    if (!selectedCharacter) return;
    if (lastCharacterRef.current !== selectedCharacter.avatar) return;

    if (chatFiles.length > 0) {
      loadChat(selectedCharacter.avatar, chatFiles[0].fileName);
    } else if (messages.length === 0) {
      startNewChat(selectedCharacter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatFiles]);

  // Phase 8.6: reload branches whenever the active chat file changes.
  useEffect(() => {
    if (currentChatFile) loadBranchesForChat(currentChatFile);
  }, [currentChatFile, loadBranchesForChat]);

  // Track scroll position to decide whether auto-scroll should fire.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 150;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll: always scroll on new user messages or when streaming starts,
  // but during ongoing streaming only scroll if the user hasn't scrolled up.
  // Suppressed while search is open (navigation controls scroll instead).
  useEffect(() => {
    if (isSearchOpen) return;
    if (!isNearBottomRef.current && isStreaming) return;
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming, isSearchOpen]);

  // Phase 6.3: Auto-read — speak the last AI message when streaming completes.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    // Streaming just ended
    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      if (!getTtsAutoRead()) return;
      const lastAi = [...messages].reverse().find((m) => !m.isUser && !m.isSystem);
      if (lastAi && lastAi.content) {
        speakText(lastAi.content);
      }
    }
  }, [isStreaming, messages]);

  // Phase 7.5: Auto-summarize — trigger after AI response if enabled and threshold reached.
  const wasSendingRef = useRef(false);
  useEffect(() => {
    if (isSending) {
      wasSendingRef.current = true;
      return;
    }
    if (!wasSendingRef.current) return;
    wasSendingRef.current = false;

    const sumStore = useSummarizeStore.getState();
    if (!sumStore.autoSummarize) return;
    if (!currentChatFile || !selectedCharacter) return;

    const nonSystemCount = messages.filter((m) => !m.isSystem).length;
    const existing = sumStore.getSummary(currentChatFile);
    const lastCount = existing?.messageCount ?? 0;
    if (nonSystemCount - lastCount >= sumStore.autoTriggerEvery) {
      sumStore.generateSummary(messages, currentChatFile, selectedCharacter.name);
    }
  }, [isSending, messages, currentChatFile, selectedCharacter]);

  // Phase 7.1/7.5: extension-gated features
  const imageGenEnabled = useExtensionStore((s) => s.enabled.imageGen);
  const summarizeEnabled = useExtensionStore((s) => s.enabled.summarize);

  // Phase 6.4: background image picker
  const handleBgFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (selectedCharacter) {
        setVnBgForCharacter(selectedCharacter.avatar, dataUrl);
      } else {
        setVnBgGlobal(dataUrl);
      }
      setVnBgState(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected later
    e.target.value = '';
  }, [selectedCharacter]);

  const handleClearBg = useCallback(() => {
    if (selectedCharacter) {
      clearVnBgForCharacter(selectedCharacter.avatar);
      setVnBgState(getVnBgGlobal());
    } else {
      clearVnBgGlobal();
      setVnBgState(null);
    }
  }, [selectedCharacter]);

  // Phase 6.4: costume setter (called from VN header input)
  const handleSetCostume = useCallback((name: string) => {
    if (!selectedCharacter) return;
    if (name.trim()) {
      setCostume(selectedCharacter.avatar, name.trim());
      setActiveCostumeState(name.trim());
    } else {
      clearCostume(selectedCharacter.avatar);
      setActiveCostumeState(null);
    }
  }, [selectedCharacter]);

  const handleSend = (content: string, images?: string[]) => {
    if (isGroupChatMode && groupChatCharacters.length >= 2) {
      sendGroupMessage(content, groupChatCharacters, images);
    } else if (selectedCharacter) {
      sendMessage(content, selectedCharacter, availableEmotions, images);
    }
  };

  // Phase 6.1: drag-and-drop image staging. Only `image/*` files are
  // accepted — everything else falls through to the browser. Nested
  // drag-enter/leave events use a counter so the overlay doesn't flicker
  // when dragging over child elements.
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
      (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(f.type)
    );
    if (files.length === 0) return;

    const { dataUrls } = await compressImageFiles(files);
    if (dataUrls.length > 0) {
      setDroppedImages(dataUrls);
      setDroppedImagesNonce((n) => n + 1);
    }
  }, []);

  const handleRegenerate = () => {
    if (selectedCharacter && !isGroupChatMode) {
      regenerateMessage(selectedCharacter, availableEmotions);
    }
  };

  const handleContinue = () => {
    if (selectedCharacter && !isGroupChatMode) {
      continueMessage(selectedCharacter, availableEmotions);
    }
  };

  // Phase 8.6: open the checkpoint naming dialog for a given message.
  const handleCheckpoint = useCallback((messageId: string) => {
    setCheckpointMessageId(messageId);
    setCheckpointName('');
    // Focus input after render
    setTimeout(() => checkpointInputRef.current?.focus(), 60);
  }, []);

  const commitCheckpoint = useCallback(() => {
    if (!checkpointMessageId || !currentChatFile) return;
    createBranch({
      chatFile: currentChatFile,
      messageId: checkpointMessageId,
      name: checkpointName,
      messages,
    });
    setCheckpointMessageId(null);
  }, [checkpointMessageId, currentChatFile, checkpointName, messages, createBranch]);

  const handleImpersonate = async () => {
    if (!selectedCharacter || isGroupChatMode) return;
    const text = await impersonate(selectedCharacter, availableEmotions);
    if (text) {
      setPrefillText(text);
      setPrefillNonce((n) => n + 1);
    }
  };

  const handleSwipeLeft = (messageId: string) => {
    swipeLeft(messageId);
  };

  const handleSwipeRight = (messageId: string) => {
    if (selectedCharacter && !isGroupChatMode) {
      swipeRight(messageId, selectedCharacter, availableEmotions);
    }
  };

  if (!selectedCharacter && !isGroupChatMode) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <MessageSquare size={64} className="text-[var(--color-text-secondary)] mb-4" />
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Select a Character
        </h2>
        <p className="text-[var(--color-text-secondary)] max-w-md">
          Choose a character from the sidebar to start chatting. You can search for
          characters or create a new one.
        </p>
      </div>
    );
  }

  const membersLabel = groupChatCharacters.map((c) => c.name).join(', ');
  const groupTitle =
    groupChatRecord?.title && groupChatRecord.title.trim().length > 0
      ? groupChatRecord.title
      : membersLabel;
  const displayName = isGroupChatMode
    ? groupTitle
    : selectedCharacter?.name ?? '';

  const commitTitle = () => {
    if (!currentChatFile) {
      setIsEditingTitle(false);
      return;
    }
    setGroupTitle(currentChatFile, titleDraft);
    setIsEditingTitle(false);
  };
  const cancelTitleEdit = () => setIsEditingTitle(false);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Phase 6.4: VN background image (z-0, behind sprite and content) */}
      {isVnMode && vnBg && (
        <img
          src={vnBg}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ zIndex: 0 }}
        />
      )}

      {/* Phase 6.4: VN sprite layer — single character (z-1) */}
      {isVnMode && !isGroupChatMode && selectedCharacter && (
        <img
          key={`vn-sprite-${selectedCharacter.avatar}-${latestEmotion ?? 'neutral'}`}
          src={getFullImageUrl(selectedCharacter.avatar, latestEmotion)}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-contain object-bottom pointer-events-none"
          style={{ zIndex: 1 }}
          onError={() => {
            if (latestEmotion) {
              const key = `${selectedCharacter.avatar}-${latestEmotion}`;
              setFailedExpressions((prev) => new Set(prev).add(key));
            }
          }}
        />
      )}

      {/* Phase 6.4: VN sprite layer — group chat, last 3 speakers side-by-side */}
      {isVnMode && isGroupChatMode && recentSpeakers.map((avatar, idx) => {
        const total = recentSpeakers.length;
        // Positioning: most recent (idx 0) is front/center, others are dimmed on sides.
        const spritePositions: Record<number, Array<CSSProperties>> = {
          1: [{ inset: 0 }],
          2: [
            { top: 0, bottom: 0, right: '5%', width: '45%' },     // most recent → right
            { top: 0, bottom: 0, left: '5%', width: '45%' },      // older → left
          ],
          3: [
            { top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '38%' }, // center
            { top: 0, bottom: 0, right: '2%', width: '35%' },     // right
            { top: 0, bottom: 0, left: '2%', width: '35%' },      // left
          ],
        };
        const positions = spritePositions[total] ?? spritePositions[1];
        const pos = positions[idx] ?? { inset: 0 };
        const opacity = idx === 0 ? 1 : 0.5;
        const zIndex = 1 + (recentSpeakers.length - idx); // most recent on top
        return (
          <img
            key={`vn-group-${avatar}`}
            src={getDefaultAvatarUrl(avatar)}
            alt=""
            aria-hidden
            className="absolute object-contain object-bottom pointer-events-none"
            style={{ opacity, zIndex, ...pos }}
          />
        );
      })}

      {/* All chat content — raised above VN sprite layers.
          Single-char sprite = z-1; group sprites = z-(2..4) for up to 3 speakers,
          so content needs to sit at z-10 to always be on top regardless of group size. */}
      <div className={`flex flex-col flex-1 min-h-0 ${isVnMode ? 'relative' : ''}`} style={isVnMode ? { zIndex: 10 } : undefined}>
      {/* Group Chat Header (always visible when in group mode) */}
      {isGroupChatMode ? (
        <>
          <div className={`h-20 relative overflow-hidden px-4 py-3 ${isVnMode ? 'bg-black/30 backdrop-blur-sm' : 'bg-gradient-to-b from-[var(--color-bg-tertiary)] to-[var(--color-bg-primary)]'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isVnMode ? 'bg-white/10' : 'bg-[var(--color-primary)]/20'}`}>
                <Users size={24} className={isVnMode ? 'text-white/80' : 'text-[var(--color-primary)]'} />
              </div>
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitTitle();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelTitleEdit();
                      }
                    }}
                    placeholder={membersLabel}
                    className={`w-full bg-transparent text-lg font-semibold border-b focus:outline-none ${isVnMode ? 'text-white border-white/50' : 'text-[var(--color-text-primary)] border-[var(--color-primary)]'}`}
                    autoFocus
                    aria-label="Edit group chat title"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(groupChatRecord?.title ?? '');
                      setIsEditingTitle(true);
                    }}
                    className="flex items-center gap-1.5 group max-w-full"
                    title="Edit title"
                  >
                    <h2 className={`text-lg font-semibold truncate ${isVnMode ? 'text-white drop-shadow-lg' : 'text-[var(--color-text-primary)]'}`}>
                      {groupTitle || 'Group Chat'}
                    </h2>
                    <Pencil
                      size={12}
                      className={`opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity ${isVnMode ? 'text-white/70' : 'text-[var(--color-text-secondary)]'}`}
                    />
                  </button>
                )}
                <p className={`text-xs truncate ${isVnMode ? 'text-white/60' : 'text-[var(--color-text-secondary)]'}`}>
                  {membersLabel}
                </p>
              </div>
              <button
                onClick={openSearch}
                className={`p-1.5 rounded-full transition-colors ${isVnMode ? 'text-white/80 hover:bg-white/10' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}
                aria-label="Search messages"
                title="Search messages"
              >
                <Search size={18} />
              </button>
              <button
                onClick={() => setShowGroupControls((v) => !v)}
                className={`p-1.5 rounded-full transition-colors ${
                  showGroupControls
                    ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                    : isVnMode
                      ? 'text-white/80 hover:bg-white/10'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
                aria-label="Group chat settings"
                aria-expanded={showGroupControls}
                title="Activation strategy & mute"
              >
                <Settings2 size={18} />
              </button>
              {isVnMode && (
                <>
                  <button
                    onClick={() => bgInputRef.current?.click()}
                    className="text-xs px-2 py-1 rounded bg-black/30 text-white/70 hover:bg-black/50 transition-colors"
                    title="Set VN background image"
                  >
                    Set BG
                  </button>
                  {vnBg && (
                    <button
                      onClick={handleClearBg}
                      className="text-xs px-2 py-1 rounded bg-black/30 text-white/60 hover:bg-black/50 transition-colors"
                      title="Clear background"
                    >
                      ✕ BG
                    </button>
                  )}
                </>
              )}
              <button
                onClick={exitGroupChat}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${isVnMode ? 'bg-black/30 text-white/70 hover:bg-black/50' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)]'}`}
              >
                Exit
              </button>
            </div>
          </div>
          {showGroupControls && currentChatFile && (
            <GroupChatControls
              fileName={currentChatFile}
              characters={groupChatCharacters}
              isSending={isSending}
            />
          )}
          {/* Hidden file input for VN background picker (group mode) */}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgFileChange}
          />
        </>
      ) : selectedCharacter ? (
        <>
          {/* Mobile: character portrait (hidden in VN mode — sprite renders as absolute layer) */}
          {!isVnMode && (
            <div className="lg:hidden h-[30vh] min-h-[150px] max-h-[250px] relative bg-gradient-to-b from-[var(--color-bg-tertiary)] to-[var(--color-bg-primary)] overflow-hidden">
              <img
                key={`${selectedCharacter.avatar}-${latestEmotion ?? 'neutral'}`}
                src={getFullImageUrl(selectedCharacter.avatar, latestEmotion)}
                alt={selectedCharacter.name}
                className="w-full h-full object-cover object-top transition-opacity duration-300"
                onError={() => {
                  if (latestEmotion) {
                    const expressionKey = `${selectedCharacter.avatar}-${latestEmotion}`;
                    setFailedExpressions((prev) => new Set(prev).add(expressionKey));
                  }
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--color-bg-primary)] to-transparent" />
              <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)] drop-shadow-lg">
                  {selectedCharacter.name}
                </h2>
                <div className="flex items-center gap-2">
                  {latestEmotion && (
                    <span className="text-xs px-2 py-1 rounded-full bg-black/30 text-white/80 backdrop-blur-sm capitalize">
                      {latestEmotion}
                    </span>
                  )}
                  <button
                    onClick={openSearch}
                    className="p-1.5 rounded-full bg-black/30 text-white/80 backdrop-blur-sm hover:bg-black/50 transition-colors"
                    aria-label="Search messages"
                    title="Search messages"
                  >
                    <Search size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Phase 6.4: VN mode compact header — shown on mobile instead of the 30vh panel */}
          {isVnMode && (
            <div className="lg:hidden bg-black/30 backdrop-blur-sm flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-2">
                <h2 className="text-sm font-semibold text-white truncate flex-1">
                  {selectedCharacter.name}
                </h2>
                {latestEmotion && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/30 text-white/70 capitalize">
                    {latestEmotion}
                  </span>
                )}
                <button
                  onClick={() => { setCostumeDraft(activeCostume ?? ''); setCostumeInputVisible((v) => !v); }}
                  className="text-xs px-2 py-1 rounded bg-black/30 text-white/70 hover:bg-black/50 transition-colors"
                  title="Change sprite costume"
                >
                  {activeCostume ? `✦ ${activeCostume}` : 'Costume'}
                </button>
                <button
                  onClick={openSearch}
                  className="p-1.5 rounded-full text-white/80 hover:bg-black/30 transition-colors"
                  aria-label="Search messages"
                  title="Search messages"
                >
                  <Search size={15} />
                </button>
                <button
                  onClick={() => bgInputRef.current?.click()}
                  className="text-xs px-2 py-1 rounded bg-black/30 text-white/70 hover:bg-black/50 transition-colors"
                  title="Set VN background image"
                >
                  Set BG
                </button>
                {vnBg && (
                  <button
                    onClick={handleClearBg}
                    className="text-xs px-2 py-1 rounded bg-black/30 text-white/60 hover:bg-black/50 transition-colors"
                    title="Clear background"
                  >
                    ✕ BG
                  </button>
                )}
              </div>
              {costumeInputVisible && (
                <div className="flex items-center gap-2 px-3 pb-2">
                  <input
                    type="text"
                    value={costumeDraft}
                    onChange={(e) => setCostumeDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { handleSetCostume(costumeDraft); setCostumeInputVisible(false); }
                      else if (e.key === 'Escape') setCostumeInputVisible(false);
                    }}
                    placeholder="Costume folder name (e.g. Alice_swimsuit)"
                    className="flex-1 text-xs bg-black/40 border border-white/20 rounded px-2 py-1 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40"
                    autoFocus
                  />
                  <button
                    onClick={() => { handleSetCostume(costumeDraft); setCostumeInputVisible(false); }}
                    className="text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    Apply
                  </button>
                  {activeCostume && (
                    <button
                      onClick={() => { handleSetCostume(''); setCostumeInputVisible(false); }}
                      className="text-xs px-2 py-1 rounded bg-black/30 text-white/60 hover:bg-black/50 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Desktop: compact header bar */}
          <div className={`hidden lg:flex flex-wrap items-center gap-2 px-4 h-auto min-h-12 border-b border-[var(--color-border)] flex-shrink-0 py-1 ${isVnMode ? 'bg-black/30 backdrop-blur-sm' : 'bg-[var(--color-bg-secondary)]'}`}>
            <h2 className={`text-sm font-semibold flex-1 truncate ${isVnMode ? 'text-white' : 'text-[var(--color-text-primary)]'}`}>
              {selectedCharacter.name}
            </h2>
            {isVnMode && (
              <>
                {latestEmotion && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-black/30 text-white/70 capitalize">
                    {latestEmotion}
                  </span>
                )}
                <button
                  onClick={() => { setCostumeDraft(activeCostume ?? ''); setCostumeInputVisible((v) => !v); }}
                  className="text-xs px-2 py-1 rounded bg-black/30 text-white/70 hover:bg-black/50 transition-colors"
                  title="Change sprite costume"
                >
                  {activeCostume ? `✦ ${activeCostume}` : 'Costume'}
                </button>
                {costumeInputVisible && (
                  <>
                    <input
                      type="text"
                      value={costumeDraft}
                      onChange={(e) => setCostumeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { handleSetCostume(costumeDraft); setCostumeInputVisible(false); }
                        else if (e.key === 'Escape') setCostumeInputVisible(false);
                      }}
                      placeholder="Costume folder (e.g. Alice_swimsuit)"
                      className="text-xs bg-black/40 border border-white/20 rounded px-2 py-1 text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 w-48"
                      autoFocus
                    />
                    <button
                      onClick={() => { handleSetCostume(costumeDraft); setCostumeInputVisible(false); }}
                      className="text-xs px-2 py-1 rounded bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      Apply
                    </button>
                    {activeCostume && (
                      <button
                        onClick={() => { handleSetCostume(''); setCostumeInputVisible(false); }}
                        className="text-xs px-2 py-1 rounded bg-black/30 text-white/60 hover:bg-black/50 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => bgInputRef.current?.click()}
                  className="text-xs px-2 py-1 rounded bg-black/30 text-white/70 hover:bg-black/50 transition-colors"
                  title="Set VN background image"
                >
                  Set BG
                </button>
                {vnBg && (
                  <button
                    onClick={handleClearBg}
                    className="text-xs px-2 py-1 rounded bg-black/30 text-white/60 hover:bg-black/50 transition-colors"
                    title="Clear background"
                  >
                    ✕ BG
                  </button>
                )}
              </>
            )}
            <button
              onClick={openSearch}
              className={`p-1.5 rounded-md transition-colors ${isVnMode ? 'text-white/80 hover:bg-black/30' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'}`}
              aria-label="Search messages"
              title="Search messages"
            >
              <Search size={18} />
            </button>
          </div>

          {/* Hidden file input for VN background picker */}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgFileChange}
          />
        </>
      ) : null}

      {/* Phase 9.1: Search bar — slides in below the header */}
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out flex-shrink-0 ${
          isSearchOpen ? 'max-h-14' : 'max-h-0'
        }`}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
          <Search size={15} className="text-[var(--color-text-secondary)] flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch();
              else if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                navigateToMatch(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateToMatch(-1);
              }
            }}
            placeholder="Search messages…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none"
          />
          {searchQuery.trim() && (
            <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap flex-shrink-0">
              {searchMatchIds.length > 0
                ? `${searchMatchIndex + 1} of ${searchMatchIds.length}`
                : 'No results'}
            </span>
          )}
          <button
            onClick={() => navigateToMatch(-1)}
            disabled={searchMatchIds.length === 0}
            className="p-1 text-[var(--color-text-secondary)] disabled:opacity-30 hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Previous match"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => navigateToMatch(1)}
            disabled={searchMatchIds.length === 0}
            className="p-1 text-[var(--color-text-secondary)] disabled:opacity-30 hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Next match"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={closeSearch}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close search"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto relative ${
          isDragOver ? 'ring-2 ring-[var(--color-primary)] ring-inset' : ''
        } ${isVnMode ? 'bg-black/40 backdrop-blur-[2px]' : ''}`}
        onScroll={handleScroll}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag-drop overlay — non-interactive, just a visual cue. */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-[var(--color-primary)]/10 backdrop-blur-sm">
            <div className="px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-primary)] text-sm text-[var(--color-text-primary)] shadow-lg">
              Drop images to attach
            </div>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center mb-4">
              {isGroupChatMode ? (
                <Users size={32} className="text-[var(--color-text-secondary)]" />
              ) : (
                <MessageSquare size={32} className="text-[var(--color-text-secondary)]" />
              )}
            </div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              Start a conversation
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
              {isGroupChatMode
                ? `Send a message to chat with ${displayName}`
                : `Send a message to begin chatting with ${displayName}`}
            </p>
          </div>
        ) : (
          <div className="py-4">
            {displayedMessages.map((message) => {
              const messageAvatar = message.isUser
                ? undefined
                : isGroupChatMode && message.characterAvatar
                  ? getAvatarUrl(message.characterAvatar, message.emotion)
                  : selectedCharacter
                    ? getAvatarUrl(selectedCharacter.avatar, message.emotion)
                    : undefined;

              const isLastAiMessage = message.id === lastAiMessageId;
              const isAiMessage = !message.isUser && !message.isSystem;
              // Show swipe controls on the last AI message always, and on any AI
              // message that already has multiple swipes (e.g. alternate greetings).
              const showSwipeControl =
                !isGroupChatMode && isAiMessage &&
                (isLastAiMessage || message.swipes.length > 1);

              return (
                <div
                  key={message.id}
                  ref={(el) => {
                    if (el) messageRefsMap.current.set(message.id, el);
                    else messageRefsMap.current.delete(message.id);
                  }}
                  className={`transition-colors duration-500 ${
                    message.id === highlightedMessageId
                      ? 'bg-[var(--color-primary)]/10'
                      : ''
                  }`}
                >
                  <ChatMessage
                    messageId={message.id}
                    name={message.name}
                    content={message.content}
                    isUser={message.isUser}
                    isSystem={message.isSystem}
                    avatar={messageAvatar}
                    timestamp={message.timestamp}
                    disabled={isSending}
                    images={message.images}
                    characterAvatar={message.isUser ? selectedCharacter?.avatar : (message.characterAvatar || selectedCharacter?.avatar)}
                    isStreaming={isLastAiMessage && isStreaming}
                    layoutMode={chatLayoutMode}
                    avatarShape={avatarShapePref}
                    fontSize={chatFontSize}
                    chatMaxWidth={chatMaxWidth}
                    swipes={message.swipes}
                    swipeId={message.swipeId}
                    showSwipeControl={showSwipeControl}
                    canGenerateSwipe={isLastAiMessage}
                    onSwipeLeft={() => handleSwipeLeft(message.id)}
                    onSwipeRight={() => handleSwipeRight(message.id)}
                    onEdit={(newContent) => editMessage(message.id, newContent)}
                    onEditAndRegenerate={
                      message.isUser && selectedCharacter && !isGroupChatMode
                        ? (newContent) =>
                            editMessageAndRegenerate(
                              message.id,
                              newContent,
                              selectedCharacter,
                              availableEmotions
                            )
                        : undefined
                    }
                    onDelete={() => deleteMessage(message.id)}
                    onRegenerate={
                      isLastAiMessage && !isGroupChatMode ? handleRegenerate : undefined
                    }
                    onCheckpoint={currentChatFile ? () => handleCheckpoint(message.id) : undefined}
                    triggerEditNonce={message.id === lastUserMessageId ? editLastNonce : undefined}
                  />
                </div>
              );
            })}

            {error && (
              <div className="mx-4 my-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Typing indicator — shown while waiting for the first token. */}
            {isSending && !isStreaming && (
              <TypingIndicator
                speakerName={isGroupChatMode ? currentSpeakerName : null}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Action Bar (regenerate/continue/impersonate/stop) */}
      {!isGroupChatMode ? (
        <ChatActionBar
          onRegenerate={handleRegenerate}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onStop={stopGeneration}
          isSending={isSending}
          hasAiMessage={hasAiMessage}
          disabled={isSending}
        />
      ) : isSending ? (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-[var(--color-border)]">
          <button
            onClick={stopGeneration}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            <Square size={14} fill="currentColor" />
            <span>Stop</span>
          </button>
        </div>
      ) : null}

      {/* Phase 8.1: Author's Note — collapsible panel for per-chat instructions */}
      {currentChatFile && <AuthorNote fileName={currentChatFile} />}

      {/* Phase 7.5: Summary panel — shown when summarize extension is enabled */}
      {summarizeEnabled && currentChatFile && selectedCharacter && (
        <SummaryPanel chatFile={currentChatFile} characterName={selectedCharacter.name} />
      )}

      {/* Phase 8.6: Branch panel — always shown when a chat file is open */}
      {currentChatFile && <BranchPanel chatFile={currentChatFile} />}

      {/* Phase 8.6: Checkpoint naming dialog — slides in above the input */}
      {checkpointMessageId && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
            Checkpoint name:
          </span>
          <input
            ref={checkpointInputRef}
            type="text"
            value={checkpointName}
            onChange={(e) => setCheckpointName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCheckpoint();
              else if (e.key === 'Escape') setCheckpointMessageId(null);
            }}
            placeholder="e.g. Before the battle"
            className="flex-1 min-w-0 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <button
            onClick={commitCheckpoint}
            className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
            title="Save checkpoint"
          >
            <Check size={16} />
          </button>
          <button
            onClick={() => setCheckpointMessageId(null)}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Phase 10.2: Quick Reply Bar */}
      <QuickReplyBar
        onPrefill={(text) => { setPrefillText(text); setPrefillNonce((n) => n + 1); }}
        onSend={handleSend}
        disabled={isSending}
      />

      {/* Input Area */}
      <ChatInput
        onSend={handleSend}
        disabled={isSending}
        placeholder={isGroupChatMode ? `Message the group...` : `Message ${displayName}...`}
        prefillText={prefillText}
        prefillNonce={prefillNonce}
        droppedImages={droppedImages}
        droppedImagesNonce={droppedImagesNonce}
        onEditLast={lastUserMessageId && !isSending ? () => setEditLastNonce((n) => n + 1) : undefined}
        onImageGen={imageGenEnabled && !isGroupChatMode && selectedCharacter ? () => setIsImageGenOpen(true) : undefined}
      />

      {/* Phase 7.1: Image generation modal */}
      {selectedCharacter && (
        <ImageGenModal
          isOpen={isImageGenOpen}
          onClose={() => setIsImageGenOpen(false)}
          initialPrompt={selectedCharacter.name}
          messages={messages}
          characterName={selectedCharacter.name}
          onInsert={async (dataUrl, prompt) => {
            await insertImageMessage(
              dataUrl,
              prompt,
              selectedCharacter.name,
              selectedCharacter.avatar,
              selectedCharacter
            );
          }}
        />
      )}

      {/* Manual-strategy hint: auto-pick is disabled, so user has to force-talk. */}
      {isGroupChatMode &&
        groupChatRecord?.activationStrategy === 'manual' &&
        !isSending && (
          <div className="px-4 pb-2 text-xs text-[var(--color-text-secondary)] italic border-t border-[var(--color-border)]/30 pt-2">
            Manual mode: open settings{' '}
            <Settings2 size={10} className="inline -mt-0.5" /> and tap a talk icon to choose who speaks next.
          </div>
        )}
      </div>{/* end VN content wrapper */}
    </div>
  );
}
