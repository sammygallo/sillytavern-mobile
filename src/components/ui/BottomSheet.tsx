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

  // iOS-safe scroll lock: freeze scroll position rather than overflow:hidden,
  // which breaks touch events on fixed elements in iOS Safari.
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Use pointer events for drag-to-dismiss — more reliable than touch events
  // across browsers and avoids iOS ghost-click issues.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { startY: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const deltaY = e.clientY - dragState.current.startY;
    dragState.current = null;
    if (deltaY > 60) onClose(); // swipe down to dismiss
  }, [onClose]);

  if (!isOpen) return null;

  return (
    // flex-col: dismiss zone stacks on top of sheet, no overlap at all.
    // bg-black/50 on the outer container provides the dark overlay without
    // any separate clickable backdrop div that could intercept button taps.
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50">

      {/* Dismiss zone — sits ABOVE the sheet, never overlaps it */}
      <div className="flex-1 cursor-default" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="w-full max-h-[60dvh] bg-[var(--color-bg-secondary)] rounded-t-2xl overflow-y-auto animate-slide-up"
      >
        {/* Drag handle — uses pointer events, not touch, for cross-platform reliability */}
        <div
          className="sticky top-0 flex justify-center pt-3 pb-2 bg-[var(--color-bg-secondary)] cursor-grab"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>

        {title && (
          <div className="px-4 pb-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          </div>
        )}

        <div className="px-4 pb-6 safe-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}
