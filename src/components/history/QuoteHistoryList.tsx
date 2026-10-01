import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FilePlus2, FileText, Search } from 'lucide-react';
import type { Quote, QuoteStatus } from '../../types';
import { useActiveUser } from '../../context/UserContext';
import { subscribeQuotesByUser } from '../../services/quoteService';
import { cn, describeItem, formatCurrency, formatDate, normalize } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { QuoteDetailModal } from './QuoteDetailModal';
import { StatusBadge } from './StatusBadge';

type StatusFilter = 'all' | QuoteStatus;

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'saved', label: 'Guardadas' },
  { value: 'exported', label: 'Exportadas' },
];

interface QuoteHistoryListProps {
  onOpenInEditor: (quote: Quote, asCopy: boolean) => void;
  onNewQuote: () => void;
}

export function QuoteHistoryList({ onOpenInEditor, onNewQuote }: QuoteHistoryListProps) {
  const user = useActiveUser();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Quote | null>(null);

  // Live: quotes saved or exported on any device appear without reopening the screen.
  useEffect(() => {
    setQuotes(null);
    return subscribeQuotesByUser(user.id, (result) => {
      setQuotes(result);
      // Keep an open detail sheet in sync with the latest data.
      setSelected((current) => (current ? (result.find((q) => q.id === current.id) ?? null) : null));
    });
  }, [user.id]);

  const filtered = useMemo(() => {
    if (!quotes) return [];
    const q = normalize(query);
    return quotes.filter((quote) => {
      if (status !== 'all' && quote.status !== status) return false;
      if (!q) return true;
      // Match quote number, date (dd/mm/yyyy) or any product in it.
      const haystack = normalize(
        [quote.quoteNumber, formatDate(quote.createdAt), ...quote.items.map(describeItem)].join(' '),
      );
      return haystack.includes(q);
    });
  }, [quotes, query, status]);

  const replaceQuote = (updated: Quote) => {
    setQuotes((prev) => prev?.map((q) => (q.id === updated.id ? updated : q)) ?? prev);
    setSelected(updated);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-10 pt-4">
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          placeholder="Buscar por número, fecha o producto"
          leading={<Search className="h-4 w-4" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar cotizaciones"
        />
        <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-150',
                status === f.value
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:text-zinc-900',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {quotes === null ? (
        <ul className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[84px] animate-pulse rounded-2xl bg-zinc-200/60" />
          ))}
        </ul>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-zinc-200/80">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-5 w-5 text-zinc-500" />
          </span>
          <p className="mt-4 text-[15px] font-semibold text-zinc-900">Todavía no tenés cotizaciones</p>
          <p className="mt-1 text-sm text-zinc-500">Las que guardes o exportes van a aparecer acá.</p>
          <Button className="mt-5" icon={<FilePlus2 className="h-4 w-4" />} onClick={onNewQuote}>
            Nueva Cotización
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">Sin resultados para esta búsqueda.</p>
      ) : (
        <>
          <p className="px-1 text-[13px] text-zinc-500">
            {filtered.length} {filtered.length === 1 ? 'cotización' : 'cotizaciones'}
          </p>
          <ul className="flex flex-col gap-2">
            {filtered.map((quote) => {
              const units = quote.items.reduce((acc, i) => acc + i.quantity, 0);
              return (
                <li key={quote.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(quote)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-zinc-200/80 transition-[box-shadow,transform] duration-150 ease-out hover:ring-zinc-300 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold tabular-nums text-zinc-900">{quote.quoteNumber}</span>
                        <StatusBadge status={quote.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-zinc-500">
                        {quote.items.map((i) => i.model || i.brand || i.type).join(', ')}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-zinc-400">
                        {formatDate(quote.createdAt, true)} · {units} {units === 1 ? 'unidad' : 'unidades'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-[15px] font-semibold tabular-nums text-zinc-900">
                        {formatCurrency(quote.totalAmount)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-zinc-400" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <QuoteDetailModal
        quote={selected}
        onClose={() => setSelected(null)}
        onChanged={replaceQuote}
        onDeleted={(id) => setQuotes((prev) => prev?.filter((q) => q.id !== id) ?? prev)}
        onOpenInEditor={onOpenInEditor}
      />
    </div>
  );
}
