import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';

const PULL_THRESHOLD = 60;
const MAX_PULL = 80;

/**
 * Pull-to-refresh gesture hook.
 * Attach `scrollRef` to the scrollable container.
 * Returns `pullDistance` (for visual indicator) and `isRefreshing`.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLDivElement | null>,
  onRefresh: () => Promise<void>,
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchState = useRef<{ startY: number; active: boolean } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0 || isRefreshing) return;
    touchState.current = { startY: e.touches[0].clientY, active: true };
  }, [scrollRef, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const state = touchState.current;
    if (!state?.active) return;
    const deltaY = e.touches[0].clientY - state.startY;
    if (deltaY > 0) {
      setPullDistance(Math.min(deltaY * 0.5, MAX_PULL)); // dampen
    } else {
      // User is scrolling up — cancel pull
      touchState.current = null;
      setPullDistance(0);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    const state = touchState.current;
    touchState.current = null;
    if (!state?.active) return;

    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      try { await onRefresh(); } catch { /* ignore */ }
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scrollRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing };
}
