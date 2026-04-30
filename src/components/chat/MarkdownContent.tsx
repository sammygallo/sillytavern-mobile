import { useMemo, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { normalizeForDisplay, wrapDialogue } from '../../utils/messageFormatting';
import { getStandardizeMessageFormatting } from '../../hooks/displayPreferences';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextSegment {
  type: 'dialogue' | 'action' | 'thought';
  content: string;
}

interface MarkdownContentProps {
  content: string;
  isUser: boolean;
  /** When true the content is still arriving token-by-token. Unclosed code
   *  fences are auto-closed before markdown parsing so they render as code
   *  rather than leaking raw backticks, and a blinking cursor is appended. */
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// RP parser — runs BEFORE markdown so roleplay formatting takes priority.
// Uses look-behind/ahead to skip ** and __ (markdown bold) while still
// capturing single *action* and _action_ markers.
// ---------------------------------------------------------------------------

const RP_REGEX =
  /((?<!\*)\*(?!\*)[^*]+\*(?!\*)|(?<!_)_(?!_)[^_]+_(?!_)|\{\{[^}]+\}\})/g;

/**
 * Parse RP segments while protecting code blocks and inline code from the RP
 * regex.  Fenced code blocks (``` … ```) and inline code (` … `) are replaced
 * with null-byte placeholders before RP matching, then restored into dialogue
 * segments so markdown can render them intact.
 */
function parseRPSegments(text: string): TextSegment[] {
  // --- Step 1: shelter code from the RP regex ---
  const codePH: Map<string, string> = new Map();
  let n = 0;
  // Fenced code blocks first (greedy across lines)
  let safe = text.replace(/```[\s\S]*?```/g, (m) => {
    const k = `\x00C${n++}\x00`; codePH.set(k, m); return k;
  });
  // Then inline code
  safe = safe.replace(/`[^`]+`/g, (m) => {
    const k = `\x00C${n++}\x00`; codePH.set(k, m); return k;
  });

  // --- Step 2: run RP regex on code-free text ---
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  RP_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RP_REGEX.exec(safe)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'dialogue', content: safe.slice(lastIndex, match.index) });
    }
    const m = match[0];
    if (m.startsWith('{{') && m.endsWith('}}')) {
      segments.push({ type: 'thought', content: m.slice(2, -2) });
    } else {
      segments.push({ type: 'action', content: m.slice(1, -1) });
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < safe.length) {
    segments.push({ type: 'dialogue', content: safe.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: 'dialogue', content: safe });
  }

  // --- Step 3: restore code placeholders in dialogue segments ---
  return segments.map((seg) => {
    if (seg.type !== 'dialogue') return seg;
    let c = seg.content;
    for (const [k, v] of codePH) c = c.replaceAll(k, v);
    return { ...seg, content: c };
  });
}

// ---------------------------------------------------------------------------
// Marked configuration — executed once at module load.
// ---------------------------------------------------------------------------

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const validLang = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted: string;
      try {
        highlighted = validLang
          ? hljs.highlight(text, { language: validLang }).value
          : hljs.highlightAuto(text).value;
      } catch {
        // Fallback: escape HTML manually
        highlighted = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
      const label = lang || 'code';
      return (
        '<div class="code-block-wrapper">' +
          '<div class="code-block-header">' +
            `<span class="code-block-lang">${label}</span>` +
            '<button class="code-copy-btn" title="Copy code">Copy</button>' +
          '</div>' +
          `<pre><code class="hljs${validLang ? ` language-${validLang}` : ''}">${highlighted}</code></pre>` +
        '</div>'
      );
    },
  },
});

// ---------------------------------------------------------------------------
// DOMPurify — ensure all links open safely in new tabs.
// ---------------------------------------------------------------------------

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'del', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'div', 'span', 'button',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'sup', 'sub',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
};

// ---------------------------------------------------------------------------
// Markdown rendering helpers
// ---------------------------------------------------------------------------

/** Heuristic: does the text contain block-level markdown structures? */
const BLOCK_PATTERN = /\n\n|^#{1,6}\s|^```|^>\s|^[-*+]\s|^\d+\.\s|^\|.+\|/m;

/**
 * Close any unclosed fenced code blocks so the markdown parser treats them as
 * code instead of leaking raw backticks into the output.  Only needed while
 * streaming — once the response is complete the fences are balanced.
 */
function closeOpenCodeFences(text: string): string {
  // Count occurrences of triple-backtick fence markers (``` with optional lang)
  const fenceMatches = text.match(/^`{3,}/gm);
  if (!fenceMatches || fenceMatches.length % 2 === 0) return text;
  // Odd number of fences → last one is unclosed. Append a closing fence.
  return text + '\n```';
}

function renderMarkdown(text: string, streaming?: boolean): { html: string; isBlock: boolean } {
  const prepared = streaming ? closeOpenCodeFences(text) : text;
  const isBlock = BLOCK_PATTERN.test(prepared);
  const raw = isBlock
    ? (marked.parse(prepared) as string)
    : (marked.parseInline(prepared) as string);
  return { html: DOMPurify.sanitize(raw, SANITIZE_CONFIG) as string, isBlock };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarkdownContent({ content, isUser, isStreaming }: MarkdownContentProps) {
  const standardize = getStandardizeMessageFormatting();
  const prepared = useMemo(
    () => (standardize ? normalizeForDisplay(content) : content),
    [content, standardize]
  );
  const segments = useMemo(() => parseRPSegments(prepared), [prepared]);

  /** Copy-button click handler — uses event delegation. */
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('code-copy-btn')) return;
    const codeEl = target.closest('.code-block-wrapper')?.querySelector('code');
    if (!codeEl) return;
    navigator.clipboard?.writeText(codeEl.textContent || '').then(() => {
      target.textContent = 'Copied!';
      setTimeout(() => { target.textContent = 'Copy'; }, 2000);
    }).catch(() => {});
  }, []);

  return (
    <div className="markdown-content" onClick={handleClick}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        if (segment.type === 'action') {
          return (
            <span
              key={index}
              className={`italic ${isUser ? 'text-white/70' : 'rp-action'}`}
            >
              {segment.content}
              {isStreaming && isLast && <span className="streaming-cursor" />}
            </span>
          );
        }
        if (segment.type === 'thought') {
          return (
            <span
              key={index}
              className={`italic ${isUser ? 'text-white/60' : 'rp-thought'}`}
            >
              {segment.content}
              {isStreaming && isLast && <span className="streaming-cursor" />}
            </span>
          );
        }

        // Dialogue → markdown. When standardization is on, wrap "…" in
        // <span class="dialogue"> before marked parses so themes can style
        // quoted speech distinctly.
        const dialogueContent = standardize ? wrapDialogue(segment.content) : segment.content;
        const { html, isBlock } = renderMarkdown(dialogueContent, isStreaming && isLast);
        const cursorHtml = isStreaming && isLast
          ? html + '<span class="streaming-cursor"></span>'
          : html;
        const Tag = isBlock ? 'div' : 'span';
        return (
          <Tag
            key={index}
            className="md-segment"
            dangerouslySetInnerHTML={{ __html: cursorHtml }}
          />
        );
      })}
    </div>
  );
}
