import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Mobile-optimized bottom sheet with drag-to-dismiss.
 * Slides up from the bottom with a drag handle pill.
 */
export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number } | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragState.current = { startY: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragState.current) return;
    const deltaY = e.changedTouches[0].clientY - dragState.current.startY;
    dragState.current = null;
    if (deltaY > 60) onClose(); // swipe down to dismiss
  }, [onClose]);

  if (!isOpen) return null;

  return (
    // Outer container handles backdrop-tap dismiss via target check.
    // The dark overlay is pointer-events:none so it can NEVER intercept taps
    // meant for sheet buttons — on iOS, overlapping clickable divs cause the
    // backdrop to swallow button taps regardless of z-index.
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Visual backdrop — pointer-events:none, purely cosmetic */}
      <div className="absolute inset-0 bg-black/50 pointer-events-none" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative z-10 w-full max-h-[60dvh] bg-[var(--color-bg-secondary)] rounded-t-2xl overflow-y-auto animate-slide-up"
      >
        {/* Drag handle — owns the drag-to-dismiss gesture so taps on action
            buttons inside the sheet don't get consumed as part of a gesture
            (was suppressing synthesized clicks on iOS and Android). */}
        <div
          className="sticky top-0 flex justify-center pt-3 pb-2 bg-[var(--color-bg-secondary)] cursor-grab touch-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>

        {title && (
          <div className="px-4 pb-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          </div>
        )}

        {/* touch-action: manipulation tells iOS to treat touches as taps
            immediately, not delay them waiting to see if it's a scroll */}
        <div className="px-4 pb-6 safe-bottom" style={{ touchAction: 'manipulation' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
