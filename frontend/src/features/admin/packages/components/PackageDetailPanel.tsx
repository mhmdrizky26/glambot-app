import React from 'react';
import Image from 'next/image';
import { Badge } from '@/components/admin/ui/badge';
import { type Package, type PackageStatus } from '../api/types';
import { formatIDR as formatCurrency } from '@/lib/formats';

interface PackageDetailPanelProps {
  pkg: Package | null;
}

const STATUS_CONFIG: Record<
  PackageStatus,
  { label: string; className: string }
> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  draft: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
};

// Hardcoded values per package id (will come from a different API later)
const getSoldCount = (id: number) => ((id * 37) % 250) + 12;

const getDateCreated = (id: number) => {
  const base = new Date(2024, 0, 1).getTime();
  const offset = (id * 86400000 * 5) % (86400000 * 365);
  return new Date(base + offset).toISOString();
};

const getLastModified = (id: number) => {
  const base = new Date(2024, 6, 1).getTime();
  const offset = (id * 86400000 * 3) % (86400000 * 180);
  return new Date(base + offset).toISOString();
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export function PackageDetailPanel({ pkg }: PackageDetailPanelProps) {
  if (!pkg) return null;

  const statusConfig = STATUS_CONFIG[pkg.status];
  const soldCount = getSoldCount(pkg.id);
  const dateCreated = getDateCreated(pkg.id);
  const lastModified = getLastModified(pkg.id);

  return (
    <div className="hidden shrink-0 flex-col gap-4 lg:flex lg:w-80 xl:w-md">
      <div className="text-lg font-semibold">Details</div>

      {/* Status + Image */}
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm">
        <div className="flex justify-center">
          <Badge
            variant="secondary"
            className={`px-4 py-1 ${statusConfig.className}`}
          >
            {statusConfig.label}
          </Badge>
        </div>

        <div className="bg-muted relative mx-auto aspect-65/80 w-full max-w-48 overflow-hidden rounded-lg border">
          {pkg.imageSrc ? (
            <Image
              src={pkg.imageSrc}
              alt={pkg.name}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
              No Image
            </div>
          )}
        </div>

        <div className="text-center">
          <div className="font-semibold">{pkg.name}</div>
          {pkg.code && (
            <div className="text-muted-foreground text-xs capitalize">
              {pkg.code}
            </div>
          )}
        </div>
      </div>

      {/* Information */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-6 text-sm shadow-sm">
        <div className="text-base font-semibold">Information</div>
        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Price</span>
          <span className="text-right font-medium">
            {formatCurrency(pkg.price)}
          </span>
        </div>
        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Sold</span>
          <span className="text-right font-medium">{soldCount}</span>
        </div>
        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Date Created</span>
          <span className="text-right font-medium">
            {formatDate(dateCreated)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Modified</span>
          <span className="text-right font-medium">
            {formatDate(lastModified)}
          </span>
        </div>
      </div>

      {/* Package Content */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-6 text-sm shadow-sm">
        <div className="text-base font-semibold">Package Content</div>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
          {pkg.description || 'No description available.'}
        </p>
      </div>
    </div>
  );
}
