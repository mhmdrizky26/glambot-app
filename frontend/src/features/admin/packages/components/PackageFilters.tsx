'use client';

import * as React from 'react';
import { useDebouncedSearch } from '@/lib/useDebouncedSearch';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';

type PackageFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
};

export function PackageFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  code,
  onCodeChange,
}: PackageFiltersProps) {
  const { localSearch, setLocalSearch, isSearchPending } = useDebouncedSearch(
    search,
    onSearchChange,
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-52 shrink-0">
        {isSearchPending ? (
          <Loader2 className="text-muted-foreground absolute top-2.5 left-3 size-4 animate-spin" />
        ) : (
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
        )}
        <Input
          placeholder="Search package name..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 pl-9 text-sm rounded-[8px]"
          aria-label="Search packages"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-9 w-36 text-sm rounded-[8px]" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-sm">Status</SelectItem>
          <SelectItem value="active" className="text-sm">Active</SelectItem>
          <SelectItem value="inactive" className="text-sm">Inactive</SelectItem>
          <SelectItem value="draft" className="text-sm">Draft</SelectItem>
        </SelectContent>
      </Select>

      <Select value={code} onValueChange={onCodeChange}>
        <SelectTrigger className="h-9 w-44 text-sm rounded-[8px]" aria-label="Filter by package type">
          <SelectValue placeholder="Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-sm">Types</SelectItem>
          <SelectItem value="regular" className="text-sm">Regular (Digital)</SelectItem>
          <SelectItem value="vip" className="text-sm">VIP (Print + Digital)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
