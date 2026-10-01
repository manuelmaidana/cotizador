import type { Quote } from '../types';
import type { ExportMode, ExportResult } from './pdfGenerator';

/** jsPDF is heavy; it's split into its own chunk and loaded on demand. */
const loadPdfModule = () => import('./pdfGenerator');

/** Call early (e.g. on screen mount) so the share sheet isn't delayed by a network fetch. */
export function preloadPdf(): void {
  void loadPdfModule();
}

export async function exportQuotePdf(quote: Quote, mode?: ExportMode): Promise<ExportResult> {
  const { exportQuotePdf: run } = await loadPdfModule();
  return run(quote, mode);
}
