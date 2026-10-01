import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Full-width sheet on mobile, centered dialog on larger screens. */
export function BottomSheet({ open, onClose, title, subtitle, children, footer }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-zinc-900/40" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl animate-sheet-up flex-col rounded-t-2xl bg-zinc-50 sm:animate-slide-up sm:rounded-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13px] text-zinc-500">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar" className="-mr-2 -mt-1">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-zinc-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
