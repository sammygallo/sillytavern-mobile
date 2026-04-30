import { ChevronLeft, ChevronRight } from 'lucide-react';
import { haptic } from '../../utils/haptics';

interface SwipeControlProps {
  swipeId: number;
  swipesCount: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
  /** When false, the right button is disabled at the last swipe (no generation). */
  canGenerate?: boolean;
}

export function SwipeControl({
  swipeId,
  swipesCount,
  onSwipeLeft,
  onSwipeRight,
  disabled,
  canGenerate = true,
}: SwipeControlProps) {
  const canSwipeLeft = swipeId > 0 && !disabled;
  const atLastSwipe = swipeId === swipesCount - 1;
  const canSwipeRight = !disabled && (!atLastSwipe || canGenerate);
  const current = swipeId + 1;
  const showHint = swipesCount === 1 && canGenerate;
  const counterText = swipesCount > 1
    ? `Variant ${current} of ${swipesCount}`
    : showHint ? 'Tap → for alternative' : `${current} of ${swipesCount}`;

  return (
    <div className="flex items-center gap-1 mt-1 text-[var(--color-text-secondary)]">
      <button
        onClick={() => { haptic(); onSwipeLeft(); }}
        disabled={!canSwipeLeft}
        className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous response"
      >
        <ChevronLeft size={16} />
      </button>
      <span
        aria-live="polite"
        className={`text-xs px-1 text-center ${
          showHint ? 'italic' : 'font-medium tabular-nums'
        }`}
      >
        {counterText}
      </span>
      <button
        onClick={() => { haptic(); onSwipeRight(); }}
        disabled={!canSwipeRight}
        className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={atLastSwipe ? 'Generate alternative response' : 'Next response'}
        title={atLastSwipe ? 'Generate alternative response' : 'Next response'}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
