import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { type Transaction } from '../api/types';

// jspdf-autotable menempelkan lastAutoTable ke instance doc tanpa deklarasi tipe.
type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

const PURPLE = [138, 56, 245] as const;
const PURPLE_LIGHT = [248, 245, 255] as const;
const GREEN = [18, 201, 100] as const;
const RED = [235, 66, 41] as const;

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);

const STATUS_LABEL: Record<string, string> = {
  success: 'Success',
  pending: 'Pending',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export function exportTransactionsToPDF(
  transactions: Transaction[],
  filters?: { status?: string; search?: string },
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now = new Date();

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('GLAMBOT', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('PHOTO BOOTH', 14, 20);
  doc.text('Transaction Report', 14, 27);

  const dateStr = now.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  doc.setFontSize(8.5);
  doc.text(`Printed: ${dateStr}`, pageW - 14, 14, { align: 'right' });
  doc.text(`Total Data: ${transactions.length} transactions`, pageW - 14, 21, { align: 'right' });

  const filterInfo: string[] = [];
  if (filters?.status && filters.status !== 'all') {
    filterInfo.push(`Status: ${STATUS_LABEL[filters.status] ?? filters.status}`);
  }
  if (filters?.search) filterInfo.push(`Search: "${filters.search}"`);
  if (filterInfo.length) {
    doc.text(`Filter — ${filterInfo.join('  ·  ')}`, pageW - 14, 28, { align: 'right' });
  }

  doc.setTextColor(0, 0, 0);

  // ── Table ────────────────────────────────────────────────────────────────
  const rows = transactions.map((t, i) => [
    i + 1,
    t.id.length > 22 ? t.id.slice(0, 20) + '…' : t.id,
    t.midtransOrderId || '-',
    t.package?.name || '-',
    t.frame?.name || '-',
    formatRupiah(t.amount),
    STATUS_LABEL[t.status] ?? t.status,
    t.paidAt ? new Date(t.paidAt).toLocaleDateString('id-ID') : '-',
    new Date(t.createdAt).toLocaleDateString('id-ID'),
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['No', 'Transaction ID', 'Order ID', 'Package', 'Frame', 'Amount', 'Status', 'Paid', 'Created']],
    body: rows,
    headStyles: {
      fillColor: [PURPLE[0], PURPLE[1], PURPLE[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [PURPLE_LIGHT[0], PURPLE_LIGHT[1], PURPLE_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
    styles: { overflow: 'ellipsize' },
    didParseCell: (data) => {
      if (data.column.index === 6 && data.section === 'body') {
        const v = data.cell.raw as string;
        if (v === 'Success') data.cell.styles.textColor = [GREEN[0], GREEN[1], GREEN[2]];
        else if (v === 'Failed' || v === 'Expired') data.cell.styles.textColor = [RED[0], RED[1], RED[2]];
      }
    },
  });

  // ── Revenue summary box ───────────────────────────────────────────────────
  const finalY: number = (doc as AutoTableDoc).lastAutoTable?.finalY ?? 200;
  const totalRevenue = transactions
    .filter((t) => t.status === 'success')
    .reduce((s, t) => s + t.amount, 0);

  if (finalY + 16 < pageH - 18) {
    doc.setFillColor(PURPLE_LIGHT[0], PURPLE_LIGHT[1], PURPLE_LIGHT[2]);
    doc.roundedRect(14, finalY + 5, pageW - 28, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Total Revenue (successful):', 20, finalY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.text(formatRupiah(totalRevenue), pageW - 20, finalY + 12, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // ── Page footer ──────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Page ${i} of ${pageCount}  ·  GLAMBOT Photo Booth  ·  ${dateStr}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' },
    );
  }

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  doc.save(`transaction-report-${stamp}.pdf`);
}
