import { useEffect, useRef } from 'react';
import { Pencil, Copy, Trash2, RefreshCw } from 'lucide-react';

interface MessageActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  anchorRight?: boolean;
}

export function MessageActionMenu({
  isOpen,
  onClose,
  onEdit,
  onCopy,
  onDelete,
  onRegenerate,
  showRegenerate,
  anchorRight,
}: MessageActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Delay to avoid catching the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEsc);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    { icon: Pencil, label: 'Edit', onClick: onEdit },
    { icon: Copy, label: 'Copy', onClick: onCopy },
    ...(showRegenerate && onRegenerate
      ? [{ icon: RefreshCw, label: 'Regenerate', onClick: onRegenerate }]
      : []),
    { icon: Trash2, label: 'Delete', onClick: onDelete, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className={`
        absolute z-20 min-w-[140px]
        bg-[var(--color-bg-secondary)] border border-[var(--color-border)]
        rounded-lg shadow-xl overflow-hidden
        ${anchorRight ? 'right-0' : 'left-0'}
      `}
      style={{ top: '100%', marginTop: '4px' }}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-2 text-sm text-left
              hover:bg-[var(--color-bg-tertiary)] transition-colors
              ${action.danger ? 'text-red-400' : 'text-[var(--color-text-primary)]'}
            `}
          >
            <Icon size={14} />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
