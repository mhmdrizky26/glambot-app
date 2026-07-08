import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { type DashboardSummary } from '../api/types';

// jspdf-autotable menempelkan lastAutoTable ke instance doc tanpa deklarasi tipe.
type AutoTableDoc = jsPDF & { lastAutoTable: { finalY: number } };

const PURPLE = [138, 56, 245] as const;
const PURPLE_LIGHT = [248, 245, 255] as const;
const GREEN = [18, 201, 100] as const;
const GREEN_LIGHT = [240, 255, 248] as const;
const RED = [235, 66, 41] as const;

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);

const ORDER_STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  cancel: 'Cancelled',
  error: 'Failed',
  pending: 'Pending',
};

function sectionTitle(doc: jsPDF, title: string, y: number, pageW: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.text(title, 14, y);
  doc.setDrawColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1.5, pageW - 14, y + 1.5);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

export function exportDashboardToPDF(summary: DashboardSummary) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now = new Date();

  const dateStr = now.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const monthStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
  doc.rect(0, 0, pageW, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('GLAMBOT', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('PHOTO BOOTH', 14, 21);
  doc.text('Dashboard Report', 14, 29);

  doc.setFontSize(9);
  doc.text(dateStr, pageW - 14, 14, { align: 'right' });
  doc.text(`Period: ${monthStr}`, pageW - 14, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // ── KPI Summary ─────────────────────────────────────────────────────────
  let y = sectionTitle(doc, 'KPI Summary', 42, pageW);

  const kpiRows = summary.kpis.map((k) => {
    const pct = Math.round(k.changePct);
    return [k.title, k.value, `${pct >= 0 ? '+' : ''}${pct}%`, k.changeLabel];
  });

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value', 'Change', 'Note']],
    body: kpiRows,
    headStyles: {
      fillColor: [PURPLE[0], PURPLE[1], PURPLE[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [PURPLE_LIGHT[0], PURPLE_LIGHT[1], PURPLE_LIGHT[2]] },
    columnStyles: {
      1: { fontStyle: 'bold', halign: 'right' },
      2: { halign: 'center', fontStyle: 'bold' },
      3: { textColor: [120, 120, 120] },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const val = data.cell.raw as string;
        if (val.startsWith('+')) data.cell.styles.textColor = [GREEN[0], GREEN[1], GREEN[2]];
        else if (val.startsWith('-')) data.cell.styles.textColor = [RED[0], RED[1], RED[2]];
      }
    },
  });

  // ── Sales Summary ───────────────────────────────────────────────────────
  const salesStartY: number = (doc as AutoTableDoc).lastAutoTable.finalY + 10;
  y = sectionTitle(doc, 'Sales Summary', salesStartY, pageW);

  const salesDelta = Math.round(summary.salesReport.delta);
  autoTable(doc, {
    startY: y,
    body: [
      ['Total Revenue This Year', formatRupiah(summary.salesReport.total)],
      [
        'Change vs Last Year',
        `${salesDelta >= 0 ? '+' : ''}${salesDelta}%`,
      ],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', fontStyle: 'bold', textColor: [PURPLE[0], PURPLE[1], PURPLE[2]] },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.section === 'body' && data.row.index === 1) {
        const val = data.cell.raw as string;
        if (val.startsWith('-')) data.cell.styles.textColor = [RED[0], RED[1], RED[2]];
      }
    },
  });

  // ── Top Frames & Top Products (side by side) ─────────────────────────────
  const topStartY: number = (doc as AutoTableDoc).lastAutoTable.finalY + 10;
  y = sectionTitle(doc, 'Top Frames & Products', topStartY, pageW);

  const midX = pageW / 2 + 3;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Frame Name', 'Usage']],
    body:
      summary.topFrames.length > 0
        ? summary.topFrames.map((f, i) => [i + 1, f.name || '-', f.used])
        : [['—', 'No data yet', '']],
    headStyles: {
      fillColor: [PURPLE[0], PURPLE[1], PURPLE[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [PURPLE_LIGHT[0], PURPLE_LIGHT[1], PURPLE_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { halign: 'center' },
    },
    margin: { left: 14, right: midX },
    styles: { overflow: 'ellipsize' },
  });
  const leftFinalY: number = (doc as AutoTableDoc).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Product Name', 'Sold']],
    body:
      summary.topProducts.length > 0
        ? summary.topProducts.map((p, i) => [i + 1, p.name || '-', p.used])
        : [['—', 'No data yet', '']],
    headStyles: {
      fillColor: [GREEN[0], GREEN[1], GREEN[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [GREEN_LIGHT[0], GREEN_LIGHT[1], GREEN_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { halign: 'center' },
    },
    margin: { left: midX, right: 14 },
    styles: { overflow: 'ellipsize' },
  });
  const rightFinalY: number = (doc as AutoTableDoc).lastAutoTable.finalY;

  // ── Recent Orders ────────────────────────────────────────────────────────
  const recentStartY = Math.max(leftFinalY, rightFinalY) + 10;
  y = sectionTitle(doc, 'Recent Transactions', recentStartY, pageW);

  autoTable(doc, {
    startY: y,
    head: [['Transaction ID', 'Package', 'Amount', 'Date', 'Status']],
    body:
      summary.recentOrders.length > 0
        ? summary.recentOrders.map((o) => [
            o.id.length > 22 ? o.id.slice(0, 20) + '…' : o.id,
            o.package || '-',
            formatRupiah(o.amount),
            o.date,
            ORDER_STATUS_LABEL[o.status] ?? o.status,
          ])
        : [['—', 'No data yet', '', '', '']],
    headStyles: {
      fillColor: [PURPLE[0], PURPLE[1], PURPLE[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [PURPLE_LIGHT[0], PURPLE_LIGHT[1], PURPLE_LIGHT[2]] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'center' },
      4: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === 'body') {
        const v = data.cell.raw as string;
        if (v === 'Completed') data.cell.styles.textColor = [GREEN[0], GREEN[1], GREEN[2]];
        else if (v === 'Failed' || v === 'Cancelled') data.cell.styles.textColor = [RED[0], RED[1], RED[2]];
      }
    },
  });

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
      pageH - 8,
      { align: 'center' },
    );
  }

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  doc.save(`dashboard-report-${stamp}.pdf`);
}
