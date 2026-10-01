import { useState } from 'react';
import { Copy, FileDown, PencilLine, Trash2 } from 'lucide-react';
import type { Quote } from '../../types';
import { useToast } from '../../context/ToastContext';
import { deleteQuote, markQuoteExported } from '../../services/quoteService';
import { exportQuotePdf } from '../../services/pdfLoader';
import { formatDate } from '../../lib/utils';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { QuoteTablePreview } from '../quote/QuoteTablePreview';
import { StatusBadge } from './StatusBadge';

interface QuoteDetailModalProps {
  quote: Quote | null;
  onClose: () => void;
  onChanged: (quote: Quote) => void;
  onDeleted: (id: string) => void;
  onOpenInEditor: (quote: Quote, asCopy: boolean) => void;
}

export function QuoteDetailModal({ quote, onClose, onChanged, onDeleted, onOpenInEditor }: QuoteDetailModalProps) {
  const notify = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!quote) return null;

  const close = () => {
    setConfirmDelete(false);
    onClose();
  };

  const onExport = async () => {
    setExporting(true);
    try {
      // Re-export uses the company snapshot stored with the quote.
      const result = await exportQuotePdf(quote);
      if (result !== 'cancelled') {
        const updated = await markQuoteExported(quote.id, quote.userId);
        if (updated) onChanged(updated);
        notify(result === 'shared' ? `${quote.quoteNumber} compartida` : `${quote.quoteNumber}.pdf descargado`);
      }
    } catch (err) {
      console.error(err);
      notify('No se pudo generar el PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteQuote(quote.id, quote.userId);
    notify(`${quote.quoteNumber} eliminada`);
    onDeleted(quote.id);
    close();
  };

  return (
    <BottomSheet
      open
      onClose={close}
      title={quote.quoteNumber}
      subtitle={
        <span className="flex items-center gap-2">
          {formatDate(quote.createdAt, true)}
          <StatusBadge status={quote.status} />
        </span>
      }
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" icon={<FileDown className="h-4 w-4" />} loading={exporting} onClick={onExport}>
            Exportar PDF
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" icon={<PencilLine className="h-4 w-4" />} onClick={() => onOpenInEditor(quote, false)}>
              Editar
            </Button>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => onOpenInEditor(quote, true)}>
              Duplicar
            </Button>
            <Button
              variant={confirmDelete ? 'primary' : 'danger'}
              className={confirmDelete ? 'bg-red-600 shadow-red-600/20 hover:bg-red-700 active:bg-red-800' : ''}
              icon={<Trash2 className="h-4 w-4" />}
              onClick={onDelete}
            >
              {confirmDelete ? 'Confirmar' : 'Borrar'}
            </Button>
          </div>
        </div>
      }
    >
      <QuoteTablePreview
        company={quote.companyInfo}
        userName={quote.userName}
        items={quote.items}
        total={quote.totalAmount}
        quoteNumber={quote.quoteNumber}
        createdAt={quote.createdAt}
        notes={quote.notes}
      />
    </BottomSheet>
  );
}
