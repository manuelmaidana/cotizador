import { AtSign, Globe, Mail, MapPin, Phone, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';
import type { CompanyInfo, QuoteItem } from '../../types';
import { cn, formatCurrency, formatDate } from '../../lib/utils';

interface QuoteTablePreviewProps {
  company: CompanyInfo;
  userName: string;
  items: QuoteItem[];
  total: number;
  quoteNumber?: string;
  createdAt?: string;
  notes?: string;
  onRemoveItem?: (id: string) => void;
  className?: string;
}

export function QuoteTablePreview({
  company,
  userName,
  items,
  total,
  quoteNumber,
  createdAt,
  notes,
  onRemoveItem,
  className,
}: QuoteTablePreviewProps) {
  const contacts: Array<{ icon: ComponentType<{ className?: string }>; value: string }> = [
    { icon: Phone, value: company.phone },
    { icon: Mail, value: company.email },
    { icon: MapPin, value: company.address },
    { icon: AtSign, value: company.instagram },
    { icon: Globe, value: company.website },
  ].filter((c) => c.value);

  return (
    <article className={cn('overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/80', className)}>
      {/* Brand header */}
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
        <div className="flex min-w-0 items-center gap-3">
          {company.logoUrl && (
            <img src={company.logoUrl} alt={company.brandName} className="h-12 w-12 shrink-0 rounded-xl object-contain" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-zinc-900">{company.brandName}</p>
            <p className="text-xs text-zinc-500">Cotización comercial</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('text-[13px] font-bold tabular-nums', quoteNumber ? 'text-zinc-900' : 'text-zinc-400')}>
            {quoteNumber ?? 'Borrador'}
          </p>
          <p className="text-xs tabular-nums text-zinc-500">{formatDate(createdAt ?? new Date().toISOString())}</p>
        </div>
      </header>

      {contacts.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-600 min-[420px]:grid-cols-2">
          {contacts.map(({ icon: Icon, value }) => (
            <li key={value} className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{value}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Items */}
      {/* Below 420px the unit price folds under the description to leave room for it. */}
      <table className="w-full table-fixed text-[13px]">
        <thead>
          <tr className="border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <th className="w-10 py-2.5 pl-3 text-center font-semibold">Cant</th>
            <th className="px-2 py-2.5 text-left font-semibold">Descripción</th>
            <th className="hidden w-[6rem] px-2 py-2.5 text-right font-semibold min-[420px]:table-cell">P. Unit.</th>
            <th className={cn('w-[6.5rem] py-2.5 text-right font-semibold', onRemoveItem ? 'px-2' : 'pl-2 pr-4')}>
              Subtotal
            </th>
            {onRemoveItem && (
              <th className="w-10">
                <span className="sr-only">Acciones</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={onRemoveItem ? 5 : 4} className="px-4 py-10 text-center text-sm text-zinc-400">
                Agregá productos para ver la cotización.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="animate-fade-in border-b border-zinc-100 even:bg-zinc-50/70">
                <td className="py-2.5 pl-3 text-center font-semibold tabular-nums text-zinc-900">{item.quantity}</td>
                <td className="px-2 py-2.5">
                  <p className="break-words font-medium leading-snug text-zinc-900">
                    {item.model || item.brand || item.type}
                  </p>
                  {item.model && (item.type || item.brand) && (
                    <p className="break-words text-xs leading-snug text-zinc-500">
                      {[item.type, item.brand].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {!item.model && item.brand && item.type && (
                    <p className="text-xs leading-snug text-zinc-500">{item.type}</p>
                  )}
                  {item.unitPrice > 0 && (
                    <p className="mt-0.5 text-xs tabular-nums text-zinc-500 min-[420px]:hidden">
                      {item.quantity} × {formatCurrency(item.unitPrice)}
                    </p>
                  )}
                </td>
                <td className="hidden px-2 py-2.5 text-right tabular-nums text-zinc-600 min-[420px]:table-cell">
                  {item.unitPrice ? formatCurrency(item.unitPrice) : '—'}
                </td>
                <td
                  className={cn(
                    'py-2.5 text-right font-semibold tabular-nums text-zinc-900',
                    onRemoveItem ? 'px-2' : 'pl-2 pr-4',
                  )}
                >
                  {item.unitPrice ? formatCurrency(item.subtotal) : '—'}
                </td>
                {onRemoveItem && (
                  <td className="pr-1 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Quitar ${item.model || item.brand || item.type}`}
                      className="inline-flex h-10 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totals & seller */}
      <footer className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-white">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total</span>
          <span className="text-[19px] font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
        {notes?.trim() && (
          <div className="rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-inset ring-zinc-200/80">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Observaciones</p>
            <p className="mt-0.5 whitespace-pre-line text-[13px] text-zinc-700">{notes}</p>
          </div>
        )}
        <p className="text-[13px] text-zinc-500">
          Cotizado por: <span className="font-semibold text-zinc-900">{userName}</span>
        </p>
      </footer>
    </article>
  );
}
