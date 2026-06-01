import React from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { Separator } from '@/components/admin/ui/separator';
import { type Transaction, type TransactionStatus } from '../api/types';

interface TransactionDetailPanelProps {
  transaction: Transaction | null;
}

const STATUS_CONFIG: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  success: {
    label: 'Success',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
  failed: {
    label: 'Failed',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  expired: {
    label: 'Expired',
    className: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80',
  },
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function TransactionDetailPanel({
  transaction,
}: TransactionDetailPanelProps) {
  if (!transaction) return null;

  const adminFee = transaction.adminFee ?? 0;
  const total = transaction.amount + adminFee;
  const statusConfig = STATUS_CONFIG[transaction.status];

  return (
    <div className="hidden shrink-0 flex-col gap-4 lg:flex lg:w-80 xl:w-md">
      <div className="text-lg font-semibold">Transaction Detail</div>
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm">
        {/* Header info */}
        <div className="flex flex-col gap-3">
          <Row label="Transaction ID">
            <span className="font-mono">{transaction.id}</span>
          </Row>
          <Row label="Created At">
            {formatDateTime(transaction.createdAt)}
          </Row>
        </div>

        <Separator />

        {/* Payment Information */}
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Payment Information</h3>
          <Row label="Status">
            <Badge
              variant="secondary"
              className={statusConfig.className}
            >
              {statusConfig.label}
            </Badge>
          </Row>
          <Row label="Midtrans Order ID">
            <span className="font-mono text-xs">
              {transaction.midtransOrderId}
            </span>
          </Row>
          <Row label="Jumlah">{formatCurrency(transaction.amount)}</Row>
          <Row label="Biaya Admin">{formatCurrency(adminFee)}</Row>
          <Separator />
          <Row label="Total">
            <span className="text-base font-semibold">
              {formatCurrency(total)}
            </span>
          </Row>
        </div>

        <Separator />

        {/* Order Information */}
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Order Information</h3>
          <Row label="Package">
            {transaction.package ? (
              <span className="flex flex-col items-end">
                <span>{transaction.package.name}</span>
                <span className="text-muted-foreground text-xs capitalize">
                  {transaction.package.code} ·{' '}
                  {transaction.package.type === 'digital+print'
                    ? 'Digital + Print'
                    : 'Digital'}
                </span>
              </span>
            ) : (
              '-'
            )}
          </Row>
          <Row label="Frame">
            {transaction.frame ? (
              <span className="flex flex-col items-end">
                <span>{transaction.frame.name}</span>
                {transaction.frame.category && (
                  <span className="text-muted-foreground text-xs">
                    {transaction.frame.category}
                  </span>
                )}
              </span>
            ) : (
              '-'
            )}
          </Row>
        </div>
      </div>
    </div>
  );
}
