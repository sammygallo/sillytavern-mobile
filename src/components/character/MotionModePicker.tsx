import { useMotionModeStore, type MotionMode } from '../../stores/motionModeStore';

interface MotionModePickerProps {
  avatar: string;
  hasLivePortraitClips: boolean;
  hasExpressionSprites: boolean;
  variant?: 'panel' | 'overlay';
  className?: string;
}

interface Option {
  value: MotionMode;
  label: string;
  available: boolean;
  unavailableHint: string;
}

export function MotionModePicker({
  avatar,
  hasLivePortraitClips,
  hasExpressionSprites,
  variant = 'panel',
  className = '',
}: MotionModePickerProps) {
  const mode = useMotionModeStore((s) => s.modesByAvatar[avatar] ?? 'auto');
  const setMode = useMotionModeStore((s) => s.setMode);

  const options: Option[] = [
    { value: 'auto', label: 'Auto', available: true, unavailableHint: '' },
    {
      value: 'expressions',
      label: 'Expressions',
      available: hasExpressionSprites,
      unavailableHint: 'No expression sprites uploaded — add them in character edit.',
    },
    {
      value: 'liveportrait',
      label: 'Live Portrait',
      available: hasLivePortraitClips,
      unavailableHint: 'No clips generated yet — set up Live Portrait in character edit.',
    },
    { value: 'none', label: 'None', available: true, unavailableHint: '' },
  ];

  const isOverlay = variant === 'overlay';
  const containerStyles = isOverlay
    ? 'bg-black/40 backdrop-blur-sm border border-white/10'
    : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]';

  const segmentBase =
    'flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:cursor-not-allowed text-center';
  const activeStyles = isOverlay
    ? 'bg-white/25 text-white'
    : 'bg-[var(--color-primary)] text-white';
  const idleStyles = isOverlay
    ? 'text-white/70 hover:text-white hover:bg-white/10'
    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]';
  const disabledStyles = isOverlay
    ? 'text-white/30 hover:bg-transparent hover:text-white/30'
    : 'text-[var(--color-text-tertiary)] opacity-50';

  return (
    <div
      role="radiogroup"
      aria-label="Avatar motion mode"
      className={`flex items-center gap-1 p-1 rounded-lg ${containerStyles} ${className}`}
    >
      {options.map((opt) => {
        const selected = mode === opt.value;
        const disabled = !opt.available;
        const title = disabled
          ? opt.unavailableHint
          : opt.value === 'auto'
            ? 'Pick the best available automatically'
            : `Use ${opt.label.toLowerCase()}`;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => setMode(avatar, opt.value)}
            title={title}
            className={`${segmentBase} ${selected ? activeStyles : disabled ? disabledStyles : idleStyles}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
