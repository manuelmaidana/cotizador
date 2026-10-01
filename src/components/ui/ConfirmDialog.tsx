import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered confirmation pop-up for destructive actions. */
export function ConfirmDialog({ open, title, children, confirmLabel = 'Eliminar', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the safe option first.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 animate-fade-in bg-zinc-900/40" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm animate-slide-up rounded-2xl bg-white p-5 shadow-xl shadow-zinc-900/10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="text-[16px] font-semibold text-zinc-900">
              {title}
            </h2>
            <div className="mt-1.5 text-sm text-zinc-600">{children}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            className="bg-red-600 shadow-red-600/20 hover:bg-red-700 active:bg-red-800"
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
