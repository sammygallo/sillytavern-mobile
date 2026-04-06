import { useState, useRef, useEffect, useMemo } from 'react';
import { MoreHorizontal, Check, X, Volume2, Square } from 'lucide-react';
import { Avatar } from '../ui';
import { MessageActionMenu } from './MessageActionMenu';
import { SwipeControl } from './SwipeControl';
import { MarkdownContent } from './MarkdownContent';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';

interface ChatMessageProps {
  /** Unique message id — used as TTS tracking key. */
  messageId: string;
  name: string;
  content: string;
  isUser: boolean;
  isSystem?: boolean;
  avatar?: string;
  timestamp?: number;
  disabled?: boolean;
  /** Phase 6.1: attached image data URLs shown as a grid above content. */
  images?: string[];
  // Swipe support (only for AI messages)
  swipes?: string[];
  swipeId?: number;
  showSwipeControl?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  // Actions
  onEdit?: (newContent: string) => void;
  onEditAndRegenerate?: (newContent: string) => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
}

interface TextSegment {
  type: 'dialogue' | 'action' | 'thought';
  content: string;
}

function parseMessageContent(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*[^*]+\*|_[^_]+_|\{\{[^}]+\}\})/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const dialogueText = text.slice(lastIndex, match.index);
      if (dialogueText) segments.push({ type: 'dialogue', content: dialogueText });
    }
    const matchedText = match[0];
    if (matchedText.startsWith('{{') && matchedText.endsWith('}}')) {
      segments.push({ type: 'thought', content: matchedText.slice(2, -2) });
    } else {
      segments.push({ type: 'action', content: matchedText.slice(1, -1) });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'dialogue', content: text.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: 'dialogue', content: text });
  }
  return segments;
}

function FormattedContent({ content, isUser }: { content: string; isUser: boolean }) {
  const segments = useMemo(() => parseMessageContent(content), [content]);
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'action') {
          return (
            <span
              key={index}
              className={`italic ${isUser ? 'text-white/70' : 'text-amber-400/90'}`}
            >
              {segment.content}
            </span>
          );
        }
        if (segment.type === 'thought') {
          return (
            <span
              key={index}
              className={`italic ${isUser ? 'text-white/60' : 'text-purple-400/80'}`}
            >
              {segment.content}
            </span>
          );
        }
        return <span key={index}>{segment.content}</span>;
      })}
    </>
  );
}

export function ChatMessage({
  messageId,
  name,
  content,
  isUser,
  isSystem,
  avatar,
  timestamp,
  disabled,
  images,
  swipes,
  swipeId,
  showSwipeControl,
  onSwipeLeft,
  onSwipeRight,
  onEdit,
  onEditAndRegenerate,
  onDelete,
  onRegenerate,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditOptions, setShowEditOptions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 6.3: TTS — only wired for non-user, non-system messages.
  const { isSupported: ttsSupported, isSpeaking, speak, stop } = useSpeechSynthesis();
  const showTtsButton = ttsSupported && !isUser && !isSystem && content.length > 0;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editContent, isEditing]);

  const handleStartEdit = () => {
    setEditContent(content);
    setIsEditing(true);
    setShowEditOptions(false);
  };

  const handleCancelEdit = () => {
    setEditContent(content);
    setIsEditing(false);
    setShowEditOptions(false);
  };

  const handleSaveOnly = () => {
    if (editContent.trim() && editContent !== content) {
      onEdit?.(editContent.trim());
    }
    setIsEditing(false);
    setShowEditOptions(false);
  };

  const handleSaveAndRegenerate = () => {
    if (editContent.trim() && onEditAndRegenerate) {
      onEditAndRegenerate(editContent.trim());
    }
    setIsEditing(false);
    setShowEditOptions(false);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(content).catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey && !isUser) {
      e.preventDefault();
      handleSaveOnly();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isUser && onEditAndRegenerate) {
        handleSaveAndRegenerate();
      } else {
        handleSaveOnly();
      }
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-full text-xs text-[var(--color-text-secondary)]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 px-4 py-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <Avatar src={avatar} alt={name} size="md" className="flex-shrink-0" />

      <div
        className={`flex flex-col max-w-[80%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">
            {name}
          </span>
          {timestamp && (
            <span className="text-xs text-zinc-500">
              {new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2 relative">
          {/* Action menu button + TTS button */}
          {!isEditing && (onEdit || onDelete) && (
            <div className="relative flex flex-col gap-0.5">
              <button
                onClick={() => setShowMenu(!showMenu)}
                disabled={disabled}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                aria-label="Message actions"
              >
                <MoreHorizontal size={16} />
              </button>
              <MessageActionMenu
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                onEdit={handleStartEdit}
                onCopy={handleCopy}
                onDelete={() => onDelete?.()}
                onRegenerate={onRegenerate}
                showRegenerate={!isUser && !!onRegenerate}
                anchorRight={isUser}
              />
              {showTtsButton && (
                <button
                  onClick={() => isSpeaking ? stop() : speak(content, messageId)}
                  className={`p-1.5 rounded-lg transition-all ${
                    isSpeaking
                      ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 opacity-100'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] opacity-0 group-hover:opacity-100 focus:opacity-100'
                  }`}
                  aria-label={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                  title={isSpeaking ? 'Stop' : 'Read aloud'}
                >
                  {isSpeaking ? <Square size={14} /> : <Volume2 size={14} />}
                </button>
              )}
            </div>
          )}

          <div
            className={`
              px-4 py-2 rounded-2xl
              ${isUser
                ? 'bg-[var(--color-primary)] text-white rounded-br-md'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-bl-md'}
              ${isEditing ? 'w-full' : ''}
            `}
          >
            {/* Phase 6.1: image attachments render above the text content.
                Grid scales column count to keep thumbnails reasonable. */}
            {!isEditing && images && images.length > 0 && (
              <div
                className={`grid gap-1 ${content.length > 0 ? 'mb-2' : ''} ${
                  images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                }`}
              >
                {images.map((src, idx) => (
                  <a
                    key={idx}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden"
                    aria-label={`View attachment ${idx + 1}`}
                  >
                    <img
                      src={src}
                      alt={`Attachment ${idx + 1}`}
                      className="w-full h-auto max-h-60 object-cover block"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`w-full bg-transparent text-sm resize-none outline-none min-h-[60px] ${isUser ? 'text-white' : 'text-[var(--color-text-primary)]'}`}
                  placeholder="Enter message..."
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className={`p-1.5 rounded-lg transition-colors ${isUser ? 'bg-white/20 hover:bg-white/30' : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-primary)]'}`}
                    title="Cancel (Esc)"
                  >
                    <X size={14} />
                  </button>
                  {isUser && onEditAndRegenerate ? (
                    <div className="relative">
                      <button
                        onClick={() => setShowEditOptions(!showEditOptions)}
                        className={`p-1.5 rounded-lg transition-colors ${isUser ? 'bg-white/20 hover:bg-white/30' : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-primary)]'}`}
                        title="Save options"
                      >
                        <Check size={14} />
                      </button>
                      {showEditOptions && (
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden">
                          <button
                            onClick={handleSaveOnly}
                            className="w-full px-3 py-2 text-xs text-left text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                          >
                            Save only
                          </button>
                          <button
                            onClick={handleSaveAndRegenerate}
                            className="w-full px-3 py-2 text-xs text-left text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                          >
                            Save &amp; regenerate
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={handleSaveOnly}
                      className={`p-1.5 rounded-lg transition-colors ${isUser ? 'bg-white/20 hover:bg-white/30' : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-primary)]'}`}
                      title="Save (Enter)"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            ) : content.length > 0 ? (
              isUser ? (
                <div className="text-sm whitespace-pre-wrap break-words">
                  <FormattedContent content={content} isUser={isUser} />
                </div>
              ) : (
                <div className="text-sm break-words">
                  <MarkdownContent content={content} isUser={false} />
                </div>
              )
            ) : null}
          </div>
        </div>

        {/* Swipe control for AI messages */}
        {showSwipeControl && !isEditing && swipes && swipeId !== undefined && onSwipeLeft && onSwipeRight && swipes.length >= 1 && (
          <SwipeControl
            swipeId={swipeId}
            swipesCount={swipes.length}
            onSwipeLeft={onSwipeLeft}
            onSwipeRight={onSwipeRight}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
