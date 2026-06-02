'use client';

import * as React from 'react';
import { Search, Loader2, Calendar } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';

type TransactionFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
};

export function TransactionFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  month,
  onMonthChange,
}: TransactionFiltersProps) {
  const [localSearch, setLocalSearch] = React.useState(search);
  const [lastExternalSearch, setLastExternalSearch] = React.useState(search);
  const isSearchPending = localSearch !== search;

  if (search !== lastExternalSearch) {
    setLastExternalSearch(search);
    setLocalSearch(search);
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-52 shrink-0">
        {isSearchPending ? (
          <Loader2 className="text-muted-foreground absolute top-2.5 left-3 size-4 animate-spin" />
        ) : (
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        )}
        <Input
          placeholder="Search transaction ID..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 rounded-[8px] pl-9 text-sm"
          aria-label="Search transactions"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger
          className="h-9 w-40 rounded-[8px] text-sm"
          aria-label="Filter by payment status"
        >
          <SelectValue placeholder="Payment Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-sm">
            Payment Status
          </SelectItem>
          <SelectItem value="success" className="text-sm">
            Success
          </SelectItem>
          <SelectItem value="pending" className="text-sm">
            Pending
          </SelectItem>
          <SelectItem value="failed" className="text-sm">
            Failed
          </SelectItem>
          <SelectItem value="expired" className="text-sm">
            Expired
          </SelectItem>
          <SelectItem value="cancelled" className="text-sm">
            Cancelled
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={month} onValueChange={onMonthChange}>
        <SelectTrigger
          className="h-9 w-36 rounded-[8px] text-sm"
          aria-label="Filter by month"
        >
          <div className="flex items-center gap-2">
            <Calendar className="size-4 opacity-50" />
            <SelectValue placeholder="Month" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-sm">
            Month
          </SelectItem>
          <SelectItem value="1" className="text-sm">
            January
          </SelectItem>
          <SelectItem value="2" className="text-sm">
            February
          </SelectItem>
          <SelectItem value="3" className="text-sm">
            March
          </SelectItem>
          <SelectItem value="4" className="text-sm">
            April
          </SelectItem>
          <SelectItem value="5" className="text-sm">
            May
          </SelectItem>
          <SelectItem value="6" className="text-sm">
            June
          </SelectItem>
          <SelectItem value="7" className="text-sm">
            July
          </SelectItem>
          <SelectItem value="8" className="text-sm">
            August
          </SelectItem>
          <SelectItem value="9" className="text-sm">
            September
          </SelectItem>
          <SelectItem value="10" className="text-sm">
            October
          </SelectItem>
          <SelectItem value="11" className="text-sm">
            November
          </SelectItem>
          <SelectItem value="12" className="text-sm">
            December
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
