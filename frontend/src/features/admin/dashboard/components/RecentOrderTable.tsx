'use client';

import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';
import { Badge } from '@/components/admin/ui/badge';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { type RecentOrder, type OrderStatus } from '../api/types';

interface RecentOrderTableProps {
  data: RecentOrder[];
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  cancel: {
    label: 'Cancel',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  error: {
    label: 'Error',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export function RecentOrderTable({ data }: RecentOrderTableProps) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Recent Order</h3>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    data.length > 0 &&
                    data.every((o) => selectedIds.has(o.id))
                      ? true
                      : data.some((o) => selectedIds.has(o.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleAll(
                      data.map((o) => o.id),
                      checked === true,
                    )
                  }
                  aria-label="Select all orders"
                />
              </TableHead>
              <TableHead className="text-sm font-semibold">ID</TableHead>
              <TableHead className="text-sm font-semibold">Package</TableHead>
              <TableHead className="text-sm font-semibold">Amount</TableHead>
              <TableHead className="hidden text-sm font-semibold sm:table-cell">
                Date
              </TableHead>
              <TableHead className="text-sm font-semibold">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((order) => (
              <TableRow
                key={order.id}
                className="hover:bg-muted/50 cursor-pointer"
                data-state={selectedIds.has(order.id) ? 'selected' : undefined}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => toggleRow(order.id)}
                    aria-label={`Select order ${order.id}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">{order.id}</TableCell>
                <TableCell className="text-sm">{order.package}</TableCell>
                <TableCell className="text-sm font-medium">
                  {formatCurrency(order.amount)}
                </TableCell>
                <TableCell className="hidden text-sm sm:table-cell">
                  {formatDate(order.date)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_CONFIG[order.status].className}
                  >
                    {STATUS_CONFIG[order.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ChevronRightIcon className="text-muted-foreground size-4" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
