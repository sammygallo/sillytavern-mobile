// In-app support assistant. Streams answers from the user's active provider,
// grounded on docs/faq.md and a small slice of current app state. No backend
// changes — uses the existing chat-completions client.

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { Modal, Button, TextArea } from '../ui';
import { api } from '../../api/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCharacterStore } from '../../stores/characterStore';
import faqMarkdown from '../../../docs/faq.md?raw';

interface HelpChatProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Inline minimal SSE parser — `parseSSEStream` exists in chatStore and
// summarizeStore but isn't exported. Duplicating once more is cheaper than
// the refactor and keeps this prototype self-contained.
async function* readSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
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
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function buildSystemPrompt(activeProvider: string, activeModel: string, characterName: string | undefined): string {
  const stateLines = [
    `Active provider: ${activeProvider || '(none)'}`,
    `Active model: ${activeModel || '(none)'}`,
    `Selected character: ${characterName || '(none)'}`,
  ].join('\n');

  return `You are the in-app support assistant for Good Girls Bot Club, a SillyTavern-based mobile chat app for AI roleplay. Answer the user's question using ONLY the FAQ below. If the answer isn't in the FAQ, say so plainly and suggest where they might look (Discord, GitHub issues) — do not invent features or settings paths. Be concise, point at the exact UI location ("Settings → AI Settings → Model"), and skip preambles.

Current app state:
${stateLines}

=== FAQ ===
${faqMarkdown}
=== END FAQ ===`;
}

export function HelpChat({ isOpen, onClose }: HelpChatProps) {
  const activeProvider = useSettingsStore((s) => s.activeProvider);
  const activeModel = useSettingsStore((s) => s.activeModel);
  const selectedCharacter = useCharacterStore((s) => s.selectedCharacter);

  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!activeProvider || !activeModel) {
      setError('Configure a provider and model in Settings → AI Settings first.');
      return;
    }

    setError(null);
    const next: HelpMessage[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    setMessages(next);
    setInput('');
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const sysPrompt = buildSystemPrompt(activeProvider, activeModel, selectedCharacter?.name);
      const wireMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
        { role: 'system', content: sysPrompt },
        ...next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
      ];

      const stream = await api.generateMessage(
        wireMessages,
        'support',
        activeProvider,
        activeModel,
        abort.signal,
        { maxTokens: 800, temperature: 0.3 },
      );
      if (!stream) throw new Error('No response from API.');

      let acc = '';
      for await (const token of readSSE(stream)) {
        if (abort.signal.aborted) break;
        acc += token;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      // Drop both the empty assistant placeholder and the just-appended user
      // turn so a retry doesn't ship the failed question to the model again.
      // Put their text back in the input box for easy edit + retry.
      setMessages((prev) => prev.slice(0, -2));
      setInput(text);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Help" size="lg">
      <div className="flex flex-col h-[70vh]">
        <div ref={scrollerRef} className="flex-1 overflow-y-auto pr-1 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-[var(--color-text-secondary)] space-y-2">
              <p>Ask anything about how the app works — providers, prompts, memory, characters, lorebooks, settings.</p>
              <p className="text-xs opacity-70">
                Answers come from a curated FAQ. The bot will say "I don't know" rather than guess. Uses your active model
                ({activeModel || '—'} via {activeProvider || '—'}).
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm whitespace-pre-wrap rounded-lg px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-[var(--color-primary)]/15 text-[var(--color-text-primary)] ml-8'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] mr-8'
              }`}
            >
              {m.content || (isStreaming && i === messages.length - 1 ? <Loader2 size={14} className="animate-spin" /> : '')}
            </div>
          ))}
          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question…"
            rows={2}
            disabled={isStreaming}
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={messages.length === 0 && !error}
              className="text-xs"
            >
              <RefreshCw size={12} className="mr-1" /> Clear
            </Button>
            <Button onClick={send} disabled={!input.trim() || isStreaming} size="sm">
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="ml-1">Send</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
