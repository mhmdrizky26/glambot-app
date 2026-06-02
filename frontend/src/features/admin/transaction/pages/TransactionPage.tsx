'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { DataPagination } from '@/components/admin/shared/DataPagination';
import { TransactionFilters } from '../components/TransactionFilters';
import { TransactionStatCards } from '../components/TransactionStatCards';
import { TransactionTable } from '../components/TransactionTable';
import { TransactionDetailPanel } from '../components/TransactionDetailPanel';
import { type Transaction, type TransactionStatus } from '../api/types';
import { useGetTransactions } from '../api/getTransactions';
import { useGetTransactionStats } from '../api/getTransactionStats';
import { useExportTransactions } from '../api/exportTransactions';

export function TransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? 'all') as
    | TransactionStatus
    | 'all';
  const month = searchParams.get('month') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  const [selectedTransactionId, setSelectedTransactionId] = React.useState<
    string | null
  >(null);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all' && value !== '') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') params.set('page', '1');
    router.replace(`/transaction?${params.toString()}`);
  };

  const { data: transactionsResponse, isLoading: isLoadingTransactions } =
    useGetTransactions({
      input: {
        page,
        limit: pageSize,
        search: search || undefined,
        status,
        month: month === 'all' ? 'all' : Number(month),
      },
    });
  const { data: stats, isLoading: isLoadingStats } = useGetTransactionStats();
  const exportMutation = useExportTransactions();

  const transactions = transactionsResponse?.data ?? [];
  const meta = transactionsResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const totalItems = meta?.total ?? 0;
  const currentPage = meta?.page ?? page;

  const selectedTransaction =
    transactions.find((t) => t.id === selectedTransactionId) ?? null;

  const handleSelectTransaction = (trx: Transaction) => {
    setSelectedTransactionId((prev) => (prev === trx.id ? null : trx.id));
  };

  const handleExport = async () => {
    try {
      const blob = await exportMutation.mutateAsync({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        month: month === 'all' ? undefined : Number(month),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transactions-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Transaksi berhasil diekspor');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat mengekspor transaksi';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Transactions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage all glambot photo <br /> transaction.
          </p>
        </div>
        <Button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          <Upload className="size-4" />
          {exportMutation.isPending ? 'Exporting...' : 'Export'}
        </Button>
      </div>

      <TransactionStatCards stats={stats} isLoading={isLoadingStats} />

      <div className="flex w-full items-start gap-6">
        <div className="flex w-full flex-col gap-4 overflow-hidden lg:flex-1">
          <TransactionFilters
            search={search}
            onSearchChange={(v) => updateParam('search', v)}
            status={status}
            onStatusChange={(v) => updateParam('status', v)}
            month={month}
            onMonthChange={(v) => updateParam('month', v)}
          />

          <div className="overflow-x-auto">
            <TransactionTable
              data={transactions}
              isLoading={isLoadingTransactions}
              selectedId={selectedTransactionId}
              onSelect={handleSelectTransaction}
            />
          </div>

          <DataPagination
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => updateParam('page', String(p))}
            onPageSizeChange={(v) => updateParam('pageSize', String(v))}
            itemLabel="transactions"
          />
        </div>

        <TransactionDetailPanel transaction={selectedTransaction} />
      </div>
    </div>
  );
}
