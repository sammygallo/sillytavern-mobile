import { useState, useRef, useEffect } from 'react';
import { Send, Mic, Paperclip, X } from 'lucide-react';
import { Button } from '../ui';
import {
  compressImageFiles,
  ACCEPTED_IMAGE_MIMES,
  MAX_IMAGES_PER_MESSAGE,
} from '../../utils/images';

interface ChatInputProps {
  /** Called with the trimmed text plus any staged image data URLs. */
  onSend: (message: string, images?: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  prefillText?: string;
  prefillNonce?: number;
  /** Phase 6.1: drag-dropped images from the chat scroll region. Parent
   *  passes a fresh array each time it wants to APPEND to the staged
   *  set; the nonce is bumped on every drop so the same payload retriggers
   *  the effect. Passing an empty array with a new nonce is a no-op. */
  droppedImages?: string[];
  droppedImagesNonce?: number;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  prefillText,
  prefillNonce,
  droppedImages,
  droppedImagesNonce,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle prefill text (e.g. from impersonate) - nonce lets parent trigger re-prefill
  useEffect(() => {
    if (prefillText !== undefined && prefillNonce !== undefined) {
      setMessage(prefillText);
      textareaRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  // Merge drag-dropped images from parent, respecting the per-message cap.
  useEffect(() => {
    if (droppedImagesNonce === undefined) return;
    if (!droppedImages || droppedImages.length === 0) return;
    setImages((prev) => {
      const next = [...prev, ...droppedImages].slice(0, MAX_IMAGES_PER_MESSAGE);
      if (
        prev.length + droppedImages.length > MAX_IMAGES_PER_MESSAGE &&
        next.length === MAX_IMAGES_PER_MESSAGE
      ) {
        setAttachmentError(
          `Max ${MAX_IMAGES_PER_MESSAGE} images per message`
        );
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedImagesNonce]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = message.trim().length > 0;
    const hasImages = images.length > 0;
    if ((hasText || hasImages) && !disabled && !isCompressing) {
      onSend(message.trim(), hasImages ? images : undefined);
      setMessage('');
      setImages([]);
      setAttachmentError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handlePickFiles = () => {
    if (disabled || isCompressing) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    // Reset the input value so picking the SAME file twice in a row still
    // fires change (useful after a user cancels a preview and re-picks).
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_IMAGES_PER_MESSAGE - images.length);
    if (remainingSlots === 0) {
      setAttachmentError(`Max ${MAX_IMAGES_PER_MESSAGE} images per message`);
      return;
    }
    const accepted = files.slice(0, remainingSlots);
    const overflow = files.length - accepted.length;

    setAttachmentError(null);
    setIsCompressing(true);
    try {
      const { dataUrls, errors } = await compressImageFiles(accepted);
      if (dataUrls.length > 0) {
        setImages((prev) =>
          [...prev, ...dataUrls].slice(0, MAX_IMAGES_PER_MESSAGE)
        );
      }
      const parts: string[] = [];
      if (overflow > 0) {
        parts.push(
          `Only kept first ${accepted.length} of ${files.length} (max ${MAX_IMAGES_PER_MESSAGE}).`
        );
      }
      if (errors.length > 0) {
        parts.push(errors.join('; '));
      }
      if (parts.length > 0) setAttachmentError(parts.join(' '));
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError(null);
  };

  const canSubmit = (message.trim().length > 0 || images.length > 0) && !isCompressing;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 pb-4 input-safe-bottom"
    >
      {/* Hidden file picker, driven by the paperclip button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_MIMES.join(',')}
        multiple
        onChange={handleFilesSelected}
        className="hidden"
        aria-hidden="true"
      />

      {/* Preview strip for staged images. Shown above the input row so the
          send button alignment stays consistent when attachments exist. */}
      {images.length > 0 && (
        <div
          className="flex gap-2 mb-2 overflow-x-auto pb-1"
          aria-label="Staged image attachments"
        >
          {images.map((dataUrl, idx) => (
            <div
              key={idx}
              className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]"
            >
              <img
                src={dataUrl}
                alt={`Attachment ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center transition-colors"
                aria-label={`Remove attachment ${idx + 1}`}
                title="Remove"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
          {isCompressing && (
            <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center">
              <span className="text-[10px] text-[var(--color-text-secondary)]">...</span>
            </div>
          )}
        </div>
      )}

      {attachmentError && (
        <div className="mb-2 text-xs text-red-400" role="alert">
          {attachmentError}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="p-2 flex-shrink-0"
          aria-label="Attach image"
          onClick={handlePickFiles}
          disabled={disabled || isCompressing || images.length >= MAX_IMAGES_PER_MESSAGE}
        >
          <Paperclip size={20} />
        </Button>

        {/* Input Area */}
        <div className="flex-1 flex items-end bg-[var(--color-bg-tertiary)] rounded-2xl px-4 py-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-[var(--color-text-primary)] placeholder-zinc-500 resize-none focus:outline-none text-sm max-h-[150px]"
          />
        </div>

        {/* Voice/Send Button */}
        {canSubmit ? (
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={disabled || isCompressing}
            className="p-2 rounded-full flex-shrink-0"
            aria-label="Send message"
          >
            <Send size={20} />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="p-2 flex-shrink-0"
            aria-label="Voice input"
          >
            <Mic size={20} />
          </Button>
        )}
      </div>
    </form>
  );
}
