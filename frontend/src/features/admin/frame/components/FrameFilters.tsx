'use client';

import * as React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/admin/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select';
import { type FrameCategory } from '../api/types';


type FrameFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: FrameCategory[];
};

export function FrameFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  categoryOptions,
}: FrameFiltersProps) {
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
          placeholder="Search frame name or code..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="h-9 pl-9 text-sm rounded-[8px]"
          aria-label="Search frames"
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
        </SelectContent>
      </Select>

      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="h-9 w-40 text-sm rounded-[8px]" aria-label="Filter by category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-sm">Category</SelectItem>
          {categoryOptions.map((cat) => (
            <SelectItem key={cat} value={cat} className="text-sm">
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
