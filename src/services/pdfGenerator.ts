import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote } from '../types';
import { describeItem, formatCurrency, formatDate } from '../lib/utils';
import { loadContactIcons, type ContactIcon } from './pdfIcons';
import { contactUrl } from './contactLinks';

type Rgb = [number, number, number];

const COLORS = {
  ink: [24, 24, 27] as Rgb, // zinc-900
  muted: [113, 113, 122] as Rgb, // zinc-500
  line: [228, 228, 231] as Rgb, // zinc-200
  soft: [244, 244, 245] as Rgb, // zinc-100
  zebra: [250, 250, 250] as Rgb, // zinc-50
  brand: [37, 99, 235] as Rgb, // #2563eb
  white: [255, 255, 255] as Rgb,
};

const MARGIN = 16;

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Mostly white/light artwork (e.g. a logo made for dark backgrounds). */
  isLight: boolean;
}

/**
 * Rasterizes any image (SVG, JPG, PNG, data URL) to PNG so jsPDF can embed it,
 * cropping fully transparent margins so padded logos aren't printed tiny.
 */
function loadImageAsPng(src: string, maxSize = 720): Promise<LoadedImage | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || maxSize;
        const naturalH = img.naturalHeight || maxSize;
        const source = document.createElement('canvas');
        source.width = naturalW;
        source.height = naturalH;
        const sctx = source.getContext('2d', { willReadFrequently: true });
        if (!sctx) return resolve(null);
        sctx.drawImage(img, 0, 0, naturalW, naturalH);

        // Bounding box of visible pixels + how much of the artwork is near-white.
        const { data } = sctx.getImageData(0, 0, naturalW, naturalH);
        let minX = naturalW, minY = naturalH, maxX = -1, maxY = -1;
        let lightCount = 0, opaqueCount = 0;
        for (let y = 0; y < naturalH; y++) {
          for (let x = 0; x < naturalW; x++) {
            const i = (y * naturalW + x) * 4;
            if (data[i + 3] < 16) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 200) lightCount++;
            opaqueCount++;
          }
        }
        if (maxX < 0) return resolve(null);
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Scale the longest side to maxSize (also upscales small SVGs for a crisp print).
        const scale = maxSize / Math.max(cropW, cropH);
        const width = Math.max(1, Math.round(cropW * scale));
        const height = Math.max(1, Math.round(cropH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(source, minX, minY, cropW, cropH, 0, 0, width, height);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width,
          height,
          // Most visible pixels near-white (Car Store logo: 70%; a typical colored logo: <10%).
          isLight: opaqueCount > 0 && lightCount / opaqueCount > 0.5,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function setColor(doc: jsPDF, kind: 'text' | 'fill' | 'draw', rgb: Rgb) {
  if (kind === 'text') doc.setTextColor(...rgb);
  else if (kind === 'fill') doc.setFillColor(...rgb);
  else doc.setDrawColor(...rgb);
}

export async function buildQuotePdf(quote: Quote): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const company = quote.companyInfo;

  // ---- Header -------------------------------------------------------------
  const logo = await loadImageAsPng(company.logoUrl);
  // Fit inside a box that suits both square and wide logos.
  const maxLogoW = 50;
  const maxLogoH = 16;
  let logoBox = 20; // header height reserved for the logo column
  let textX = MARGIN;
  if (logo) {
    const fit = Math.min(maxLogoW / logo.width, maxLogoH / logo.height);
    const w = logo.width * fit;
    const h = logo.height * fit;
    // Light artwork (white lettering) would vanish on paper: put it on a dark tile.
    const pad = logo.isLight ? 3.5 : 0;
    const tileW = w + pad * 2;
    const tileH = h + pad * 2;
    logoBox = Math.max(20, tileH);
    const tileY = MARGIN + (logoBox - tileH) / 2;
    if (logo.isLight) {
      setColor(doc, 'fill', COLORS.ink);
      doc.roundedRect(MARGIN, tileY, tileW, tileH, 3, 3, 'F');
    }
    doc.addImage(logo.dataUrl, 'PNG', MARGIN + pad, tileY + pad, w, h);
    textX = MARGIN + tileW + 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setColor(doc, 'text', COLORS.ink);
  doc.text(company.brandName || 'Cotización', textX, MARGIN + 6);

  // Contact details: one per line, each with its icon on the left.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setColor(doc, 'text', COLORS.muted);
  const icons = await loadContactIcons('#71717a'); // zinc-500, same tone as the text
  const contacts: Array<{ icon: ContactIcon; text: string | undefined }> = [
    { icon: 'phone', text: company.phone },
    { icon: 'whatsapp', text: company.whatsapp }, // absent in quotes saved before it existed
    { icon: 'email', text: company.email },
    { icon: 'address', text: company.address },
    { icon: 'instagram', text: company.instagram },
    { icon: 'website', text: company.website },
  ];
  const ICON = 3; // mm
  const LINE = 4.6; // mm
  const contactX = textX + ICON + 1.8;
  // Wrap to the space left of the quote-number block.
  const maxTextW = pageWidth - MARGIN - 44 - contactX;
  let contactY = MARGIN + 11.5;
  for (const { icon, text } of contacts) {
    if (!text?.trim()) continue;
    const lines = doc.splitTextToSize(text, maxTextW) as string[];
    const png = icons[icon];
    // Icon vertically centered on the first text line (baseline sits ~0.9mm below center).
    if (png) doc.addImage(png, 'PNG', textX, contactY - ICON + 0.6, ICON, ICON);
    lines.forEach((line, i) => doc.text(line, contactX, contactY + i * 3.8));
    // Clickable area: icon + text of every line of this entry.
    const url = contactUrl(icon, text);
    if (url) {
      const width = ICON + 1.8 + Math.max(...lines.map((l) => doc.getTextWidth(l)));
      const height = ICON + 0.8 + (lines.length - 1) * 3.8;
      doc.link(textX, contactY - ICON + 0.2, width, height, { url });
    }
    contactY += LINE + (lines.length - 1) * 3.8;
  }
  const contactsHeight = contactY - LINE - MARGIN;

  // Quote meta, right aligned
  const rightX = pageWidth - MARGIN;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  setColor(doc, 'text', COLORS.brand);
  doc.text('COTIZACIÓN', rightX, MARGIN + 5, { align: 'right' });
  doc.setFontSize(12);
  setColor(doc, 'text', COLORS.ink);
  doc.text(quote.quoteNumber, rightX, MARGIN + 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setColor(doc, 'text', COLORS.muted);
  doc.text(`Fecha: ${formatDate(quote.createdAt)}`, rightX, MARGIN + 16, { align: 'right' });

  const headerBottom = MARGIN + Math.max(logoBox, contactsHeight + 2) + 5;
  setColor(doc, 'draw', COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, headerBottom, pageWidth - MARGIN, headerBottom);

  // ---- Items table --------------------------------------------------------
  autoTable(doc, {
    startY: headerBottom + 6,
    margin: { left: MARGIN, right: MARGIN, bottom: 22 },
    head: [['Cant.', 'Descripción', 'P. Unitario', 'Subtotal']],
    body: quote.items.map((item) => [
      String(item.quantity),
      describeItem(item) || '—',
      item.unitPrice ? formatCurrency(item.unitPrice) : '—',
      item.unitPrice ? formatCurrency(item.subtotal) : '—',
    ]),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: COLORS.ink,
      cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
      lineColor: COLORS.line,
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: COLORS.zebra },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      1: { halign: 'left' },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 34, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && (data.column.index === 2 || data.column.index === 3)) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'center';
    },
  });

  // ---- Totals -------------------------------------------------------------
  const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? headerBottom + 20;
  let y = tableEnd + 6;
  if (y + 40 > pageHeight - 22) {
    doc.addPage();
    y = MARGIN;
  }

  const boxW = 74;
  const boxX = pageWidth - MARGIN - boxW;
  setColor(doc, 'fill', COLORS.soft);
  doc.roundedRect(boxX, y, boxW, 15, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setColor(doc, 'text', COLORS.muted);
  doc.text('TOTAL', boxX + 5, y + 9.4);
  doc.setFontSize(13);
  setColor(doc, 'text', COLORS.ink);
  doc.text(formatCurrency(quote.totalAmount), boxX + boxW - 5, y + 9.8, { align: 'right' });

  // Seller
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, 'text', COLORS.muted);
  doc.text('Cotizado por:', MARGIN, y + 6);
  doc.setFont('helvetica', 'bold');
  setColor(doc, 'text', COLORS.ink);
  doc.text(quote.userName, MARGIN, y + 11);
  y += 24;

  // ---- Notes --------------------------------------------------------------
  if (quote.notes) {
    const lines = doc.splitTextToSize(quote.notes, pageWidth - MARGIN * 2) as string[];
    if (y + 8 + lines.length * 4.5 > pageHeight - 22) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColor(doc, 'text', COLORS.muted);
    doc.text('OBSERVACIONES', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, 'text', COLORS.ink);
    doc.text(lines, MARGIN, y + 5.5);
  }

  // ---- Footer on every page ----------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setColor(doc, 'draw', COLORS.line);
    doc.line(MARGIN, pageHeight - 15, pageWidth - MARGIN, pageHeight - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, 'text', COLORS.muted);
    doc.text('Precios sujetos a modificación sin previo aviso.', MARGIN, pageHeight - 10);
    doc.text(`${quote.quoteNumber}  ·  Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - 10, {
      align: 'right',
    });
  }

  return doc;
}

export type ExportMode = 'auto' | 'download' | 'share';
export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

function isMobileDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Builds the PDF and delivers it.
 * `auto`: native share sheet on touch devices that support file sharing, download otherwise.
 */
export async function exportQuotePdf(quote: Quote, mode: ExportMode = 'auto'): Promise<ExportResult> {
  const doc = await buildQuotePdf(quote);
  const fileName = `${quote.quoteNumber}.pdf`;

  const wantsShare = mode === 'share' || (mode === 'auto' && isMobileDevice());
  if (wantsShare && typeof navigator !== 'undefined' && 'canShare' in navigator) {
    const file = new File([doc.output('blob')], fileName, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Cotización ${quote.quoteNumber}`,
          text: `${quote.companyInfo.brandName} — Cotización ${quote.quoteNumber}`,
        });
        return 'shared';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
        // Any other share failure (e.g. lost user activation) falls back to download.
      }
    }
  }

  doc.save(fileName);
  return 'downloaded';
}
