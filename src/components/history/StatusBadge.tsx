import type { QuoteStatus } from '../../types';
import { cn } from '../../lib/utils';

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        status === 'exported' ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-zinc-600',
      )}
    >
      {status === 'exported' ? 'Exportada' : 'Guardada'}
    </span>
  );
}
