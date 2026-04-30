import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Mobile-optimized bottom sheet with drag-to-dismiss.
 *
 * Pattern: one full-screen container owns the onClose click handler.
 * The sheet inside calls e.stopPropagation() so taps on sheet content
 * never bubble up to the container's onClose. This is the standard
 * overlay pattern and works identically on every browser/platform.
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

  // iOS-safe scroll lock: position:fixed avoids the overflow:hidden iOS Safari
  // bug that breaks touch events on fixed-position children.
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = { startY: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const deltaY = e.clientY - dragState.current.startY;
    dragState.current = null;
    if (deltaY > 60) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    /*
      Full-screen overlay — clicking/tapping the dark area calls onClose.
      The sheet inside stops propagation so nothing inside it accidentally
      bubbles up and triggers this handler.
    */
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={onClose}
    >
      {/* Sheet — stopPropagation keeps all inner taps from reaching the overlay's onClose */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 max-h-[80dvh] bg-[var(--color-bg-secondary)] rounded-t-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 flex justify-center pt-3 pb-2 cursor-grab"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>

        {title && (
          <div className="flex-shrink-0 px-4 pb-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          </div>
        )}

        {/* Scrollable content — overflow-y lives on the inner div, not the sheet */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-6 safe-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}
