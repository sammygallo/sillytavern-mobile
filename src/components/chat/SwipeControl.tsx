import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SwipeControlProps {
  swipeId: number;
  swipesCount: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
}

export function SwipeControl({
  swipeId,
  swipesCount,
  onSwipeLeft,
  onSwipeRight,
  disabled,
}: SwipeControlProps) {
  const canSwipeLeft = swipeId > 0 && !disabled;
  const current = swipeId + 1;

  return (
    <div className="flex items-center gap-1 mt-1 text-[var(--color-text-secondary)]">
      <button
        onClick={onSwipeLeft}
        disabled={!canSwipeLeft}
        className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous response"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs font-medium min-w-[2.5rem] text-center tabular-nums">
        {current}/{swipesCount}
      </span>
      <button
        onClick={onSwipeRight}
        disabled={disabled}
        className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={swipeId === swipesCount - 1 ? 'Generate new response' : 'Next response'}
        title={swipeId === swipesCount - 1 ? 'Generate new response' : 'Next response'}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
