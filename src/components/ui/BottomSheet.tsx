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
 *
 * Architecture: backdrop (z-40) + sheet (z-50) as siblings so iOS Safari
 * z-index stacking (not flex hit-testing) determines event routing. Buttons
 * inside the z-50 sheet always win over the z-40 backdrop.
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

  // iOS-safe scroll lock: position:fixed avoids the overflow:hidden bug in
  // iOS Safari that breaks touch events on fixed-position children.
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
    <>
      {/*
        Backdrop — z-40, covers full screen, click/tap outside sheet closes it.
        Lives in a separate layer from the sheet so iOS Safari routes events via
        z-index stacking (reliable) rather than flex hit-testing (not reliable).
      */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/*
        Sheet — z-50 (above backdrop). Buttons here always win because they're
        in the topmost stacking layer. Content scrolls inside an inner div so
        the sheet's own box never needs overflow:auto (avoids the iOS
        scroll-vs-tap ambiguity on the outer container).
      */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[80dvh] bg-[var(--color-bg-secondary)] rounded-t-2xl flex flex-col animate-slide-up"
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

        {/* Scrollable content — overflow lives here, not on the sheet itself */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-6 safe-bottom">
          {children}
        </div>
      </div>
    </>
  );
}
