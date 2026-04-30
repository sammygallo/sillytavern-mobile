import { useEffect, useState } from 'react';
import { X, BookOpen, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { MarkdownDoc } from '../ui/MarkdownDoc';
import { getGuide } from './guides';

interface GuideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  guideSlug: string;
  /** Optional heading id to scroll to inside the guide. */
  sectionId?: string;
}

const EXIT_MS = 220;

export function GuideDrawer({ isOpen, onClose, guideSlug, sectionId }: GuideDrawerProps) {
  const navigate = useNavigate();
  const guide = getGuide(guideSlug);
  const [mounted, setMounted] = useState(isOpen);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (mounted) {
      setExiting(true);
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!mounted || !guide) return null;

  const openFullPage = () => {
    onClose();
    navigate(`/guides/${guide.slug}${sectionId ? `#${sectionId}` : ''}`);
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm motion-reduce:transition-none ${
          exiting
            ? 'opacity-0 transition-opacity duration-200'
            : 'opacity-100 animate-guide-drawer-backdrop-in'
        }`}
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-md h-full bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] shadow-2xl flex flex-col safe-top safe-bottom motion-reduce:transition-none motion-reduce:animate-none ${
          exiting
            ? 'translate-x-full transition-transform duration-200 ease-out'
            : 'translate-x-0 animate-guide-drawer-in'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen size={18} className="text-[var(--color-primary)] shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {guide.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              aria-label="Open full guide"
              onClick={openFullPage}
            >
              <ExternalLink size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              aria-label="Close guide"
              onClick={onClose}
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <MarkdownDoc source={guide.source} scrollToId={sectionId} />
        </div>
      </div>
    </div>
  );
}
