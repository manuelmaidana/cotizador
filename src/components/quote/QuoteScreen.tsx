import { useEffect, useState } from 'react';
import { FileDown, Save } from 'lucide-react';
import type { FieldToggles } from '../../types';
import type { QuoteDraftApi } from '../../hooks/useQuoteDraft';
import { useActiveUser } from '../../context/UserContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import { markQuoteExported, saveQuote } from '../../services/quoteService';
import { exportQuotePdf, preloadPdf } from '../../services/pdfLoader';
import { readJson, writeJson } from '../../services/storage';
import { cn, sumItems } from '../../lib/utils';
import { userMessage } from '../../lib/errors';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Textarea } from '../ui/Input';
import { DynamicOptionToggles } from './DynamicOptionToggles';
import { QuoteBuilder } from './QuoteBuilder';
import { QuoteTablePreview } from './QuoteTablePreview';

const TOGGLES_KEY = 'fieldToggles';
const DEFAULT_TOGGLES: FieldToggles = { type: true, brand: true, model: true, price: true };

export function QuoteScreen({ draftApi }: { draftApi: QuoteDraftApi }) {
  const user = useActiveUser();
  const { company } = useCompany();
  const notify = useToast();
  const { draft, addItem, removeItem, setNotes, markSaved } = draftApi;
  const [toggles, setToggles] = useState<FieldToggles>(() => ({
    ...DEFAULT_TOGGLES,
    ...readJson<Partial<FieldToggles>>(TOGGLES_KEY, {}),
  }));
  const [busy, setBusy] = useState<'save' | 'export' | null>(null);

  useEffect(preloadPdf, []);

  const total = sumItems(draft.items);
  const isEmpty = draft.items.length === 0;

  const updateToggles = (next: FieldToggles) => {
    setToggles(next);
    writeJson(TOGGLES_KEY, next);
  };

  /** Saves (or updates) the quote; an already exported quote stays exported. */
  const persist = async () => {
    const quote = await saveQuote({ draft, user, companyInfo: company, status: 'saved' });
    markSaved(quote);
    return quote;
  };

  const onSave = async () => {
    setBusy('save');
    try {
      const quote = await persist();
      notify(`${quote.quoteNumber} guardada en el historial`);
    } catch (err) {
      console.error(err);
      notify(userMessage(err, 'No se pudo guardar la cotización. Revisá la conexión.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const onExport = async () => {
    setBusy('export');
    let quote;
    try {
      // 1. Always saved to the history first, so an export is never lost.
      quote = await persist();
    } catch (err) {
      console.error(err);
      notify(userMessage(err, 'No se pudo guardar la cotización. Revisá la conexión.'), 'error');
      setBusy(null);
      return;
    }
    try {
      // 2. PDF, then 3. mark as exported only once the PDF was actually delivered.
      const result = await exportQuotePdf(quote);
      if (result === 'cancelled') {
        notify(`${quote.quoteNumber} guardada en el historial`);
        return;
      }
      // The PDF is out: show it as exported right away; the status write finishes in the
      // background (it's already safe in the offline cache and syncs if the signal is poor).
      const exportedQuote = quote;
      markSaved({ ...exportedQuote, status: 'exported' });
      markQuoteExported(exportedQuote.id, user.id).catch((err) => {
        console.error(err);
        notify(`${exportedQuote.quoteNumber}: no se pudo marcar como exportada. Volvé a exportarla.`, 'error');
      });
      notify(
        result === 'shared'
          ? `${quote.quoteNumber} compartida y guardada como exportada`
          : `${quote.quoteNumber}.pdf descargado y guardado como exportada`,
      );
    } catch (err) {
      console.error(err);
      notify(`${quote.quoteNumber} quedó guardada, pero no se pudo generar el PDF`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = !draft.savedId
    ? null
    : draft.dirty
      ? { label: 'Cambios sin guardar', className: 'bg-amber-50 text-amber-700' }
      : draft.status === 'exported'
        ? { label: 'Exportada', className: 'bg-brand-50 text-brand-700' }
        : { label: 'Guardada', className: 'bg-emerald-50 text-emerald-700' };

  return (
    <>
      <div className="mx-auto grid max-w-3xl gap-4 px-4 pb-32 pt-4 lg:max-w-6xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Agregar producto" description="Activá solo los campos que necesites." />
            <div className="flex flex-col gap-4 p-4">
              <DynamicOptionToggles value={toggles} onChange={updateToggles} />
              <QuoteBuilder toggles={toggles} onAddItem={addItem} itemCount={draft.items.length} />
            </div>
          </Card>

          <Card className="p-4">
            <Field label="Observaciones (opcional)" htmlFor="f-notes">
              <Textarea
                id="f-notes"
                placeholder="Validez de la oferta, forma de pago, garantía…"
                value={draft.notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </Field>
          </Card>
        </div>

        <section aria-labelledby="preview-title" className="flex flex-col gap-2 lg:sticky lg:top-20">
          <div className="flex items-center justify-between px-1">
            <h2 id="preview-title" className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
              Vista previa
            </h2>
            {statusBadge && (
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', statusBadge.className)}>
                {statusBadge.label}
              </span>
            )}
          </div>
          <QuoteTablePreview
            company={company}
            userName={user.name}
            items={draft.items}
            total={total}
            quoteNumber={draft.quoteNumber}
            createdAt={draft.createdAt}
            notes={draft.notes}
            onRemoveItem={removeItem}
          />
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3 px-4 lg:max-w-6xl lg:justify-end">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 lg:flex-none"
            icon={<Save className="h-4 w-4" />}
            loading={busy === 'save'}
            // Always available: saving an unchanged quote is harmless and confirms it's in the history.
            disabled={isEmpty || busy !== null}
            onClick={onSave}
          >
            <span className="min-[400px]:hidden">Guardar</span>
            <span className="hidden min-[400px]:inline">Guardar Cotización</span>
          </Button>
          <Button
            size="lg"
            className="flex-1 lg:flex-none"
            icon={<FileDown className="h-4 w-4" />}
            loading={busy === 'export'}
            disabled={isEmpty || busy !== null}
            onClick={onExport}
          >
            Exportar PDF
          </Button>
        </div>
      </div>
    </>
  );
}
