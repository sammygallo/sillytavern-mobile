import { useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';

interface MarkdownDocProps {
  source: string;
  /** If set, scroll the heading with this id into view after render. */
  scrollToId?: string;
  /** Called once with the list of {id, text, level} for each heading. */
  onHeadings?: (headings: Heading[]) => void;
  className?: string;
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderMarkdown(source: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => ('text' in t ? t.text : '')).join('');
    let id = slugify(text);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count}`;
    headings.push({ id, text, level: depth });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const html = marked.parse(source, { renderer, async: false }) as string;
  return { html, headings };
}

export function MarkdownDoc({ source, scrollToId, onHeadings, className }: MarkdownDocProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { html, headings } = useMemo(() => renderMarkdown(source), [source]);

  useEffect(() => {
    onHeadings?.(headings);
  }, [headings, onHeadings]);

  useEffect(() => {
    if (!scrollToId || !containerRef.current) return;
    // Defer the scroll until after layout settles — when MarkdownDoc lives
    // inside a panel that's still sliding in, an immediate scrollIntoView can
    // no-op against the in-flight transform.
    const scrollTimer = setTimeout(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(scrollToId)}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const reduceMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) return;

      const reset = () => {
        el.style.transition = '';
        el.style.backgroundColor = '';
      };
      el.style.transition = 'background-color 0ms';
      el.style.backgroundColor = 'rgba(168, 85, 247, 0.22)';
      requestAnimationFrame(() => {
        el.style.transition = 'background-color 1100ms ease-out';
        el.style.backgroundColor = 'transparent';
      });
      setTimeout(reset, 1300);
    }, 50);
    return () => clearTimeout(scrollTimer);
  }, [scrollToId, html]);

  return (
    <div
      ref={containerRef}
      className={`text-sm text-[var(--color-text-primary)] leading-relaxed
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-[var(--color-text-primary)]
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[var(--color-text-primary)] [&_h2]:scroll-mt-4
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-[var(--color-text-primary)] [&_h3]:scroll-mt-4
        [&_p]:my-2
        [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc
        [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal
        [&_li]:my-1
        [&_strong]:font-semibold [&_strong]:text-[var(--color-text-primary)]
        [&_em]:italic [&_em]:text-[var(--color-text-secondary)]
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[var(--color-bg-tertiary)] [&_code]:text-xs [&_code]:font-mono
        [&_a]:text-[var(--color-primary)] [&_a]:underline
        ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
