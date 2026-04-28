import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface HelpTipProps {
  tip: string;
  title?: string;
}

export function HelpTip({ tip, title }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 280),
      });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-helptip-popover]') && !target.closest('[data-helptip-trigger]')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-helptip-trigger
        onClick={handleToggle}
        className="inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] rounded-full"
        aria-label="Show help"
        aria-expanded={open}
      >
        <HelpCircle size={14} />
      </button>

      {open &&
        createPortal(
          <div
            data-helptip-popover
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[9999] w-64 p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-2xl"
          >
            {title && (
              <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1.5">
                {title}
              </p>
            )}
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{tip}</p>
          </div>,
          document.body
        )}
    </>
  );
}
