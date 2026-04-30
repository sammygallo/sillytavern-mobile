import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Link as LinkIcon, X } from 'lucide-react';
import { useGuidesPanelStore } from '../../stores/guidesPanelStore';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../utils/permissions';
import { MarkdownDoc, type Heading } from '../ui/MarkdownDoc';
import { showToastGlobal } from '../ui/Toast';
import { GUIDES, getGuide } from './guides';

export function GuidesPanel() {
  const { isOpen, slug, sectionId, setGuide, clearGuide, close } = useGuidesPanelStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!mounted) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mounted, close]);

  const visibleGuides = useMemo(
    () => GUIDES.filter((g) => !g.requiredPermission || hasPermission(currentUser, g.requiredPermission)),
    [currentUser],
  );

  const guide = slug ? getGuide(slug) : undefined;
  const canViewGuide = guide && (!guide.requiredPermission || hasPermission(currentUser, guide.requiredPermission));

  const [headings, setHeadings] = useState<Heading[]>([]);
  const [scrollToId, setScrollToId] = useState<string | undefined>(sectionId);

  useEffect(() => {
    setScrollToId(sectionId);
  }, [sectionId, slug]);

  if (!mounted) return null;

  const tocHeadings = headings.filter((h) => h.level === 2);

  const copyShareLink = async () => {
    if (!slug) return;
    const url = `${window.location.origin}/guides/${slug}${scrollToId ? `#${scrollToId}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      showToastGlobal('Link copied', 'success');
    } catch {
      showToastGlobal('Could not copy link', 'error');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={close}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[90vw] sm:max-w-4xl
          bg-[var(--color-bg-primary)] border-l border-[var(--color-border)] shadow-2xl
          flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out
          ${visible ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {slug && (
              <button
                onClick={clearGuide}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
                aria-label="Back to all guides"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <BookOpen size={18} className="text-[var(--color-primary)] shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {guide ? guide.title : 'Guides'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {slug && (
              <button
                onClick={copyShareLink}
                className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
                aria-label="Copy link to this guide"
                title="Copy shareable link"
              >
                <LinkIcon size={16} />
              </button>
            )}
            <button
              onClick={close}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
              aria-label="Close guides"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        {!slug || !canViewGuide ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto">
              <header className="mb-4">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Walkthroughs and references for building characters, lorebooks, and more.
                </p>
              </header>
              {visibleGuides.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No guides available for your role yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleGuides.map((g) => (
                    <li key={g.slug}>
                      <button
                        type="button"
                        onClick={() => setGuide(g.slug)}
                        className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]/60 transition-colors p-4"
                      >
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {g.title}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {g.summary}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <aside className="hidden lg:block w-60 shrink-0 border-r border-[var(--color-border)] overflow-y-auto p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
                On this page
              </p>
              <nav className="space-y-1">
                {tocHeadings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setScrollToId(h.id)}
                    className="block w-full text-left text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] py-1"
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            </aside>

            <main className="flex-1 overflow-y-auto p-6">
              <div key={guide!.slug} className="max-w-3xl mx-auto animate-guide-fade-in">
                <header className="mb-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">{guide!.summary}</p>
                </header>
                <MarkdownDoc source={guide!.source} scrollToId={scrollToId} onHeadings={setHeadings} />
              </div>
            </main>
          </div>
        )}
      </div>
    </>
  );
}
