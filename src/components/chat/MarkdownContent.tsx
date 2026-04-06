import { useMemo, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

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

const SANITIZE_CONFIG: DOMPurify.Config = {
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

function renderMarkdown(text: string): { html: string; isBlock: boolean } {
  const isBlock = BLOCK_PATTERN.test(text);
  const raw = isBlock
    ? (marked.parse(text) as string)
    : (marked.parseInline(text) as string);
  return { html: DOMPurify.sanitize(raw, SANITIZE_CONFIG), isBlock };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarkdownContent({ content, isUser }: MarkdownContentProps) {
  const segments = useMemo(() => parseRPSegments(content), [content]);

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

        // Dialogue → markdown
        const { html, isBlock } = renderMarkdown(segment.content);
        const Tag = isBlock ? 'div' : 'span';
        return (
          <Tag
            key={index}
            className="md-segment"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}
