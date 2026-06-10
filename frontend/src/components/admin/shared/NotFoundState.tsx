'use client';

import * as React from 'react';
import { FileQuestion, ChevronLeftIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';

interface NotFoundStateProps {
  /** Judul utama, biasanya nama entity. Contoh: "Frame tidak ditemukan". */
  title: string;
  /**
   * Penjelasan tambahan opsional. Default-nya template generik yang
   * menjelaskan kemungkinan penyebab.
   */
  description?: string;
  /** Label tombol kembali. Contoh: "Kembali ke List Frame". */
  backLabel: string;
  /** Aksi tombol kembali. */
  onBack: () => void;
}

/**
 * Tampilan "not found" yang dipakai di seluruh halaman edit/detail saat
 * data tidak tersedia (misal id tidak valid, dihapus user lain, atau
 * server error). Konsistensi visual + bahasa membuat pengalaman seragam
 * di semua fitur.
 */
export function NotFoundState({
  title,
  description = 'The data you are looking for may have been deleted or the ID is invalid.',
  backLabel,
  onBack,
}: NotFoundStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        <FileQuestion className="text-muted-foreground size-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-foreground text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      </div>
      <Button
        onClick={onBack}
        variant="outline"
        className="gap-2 rounded-[8px] text-[14px]"
      >
        <ChevronLeftIcon className="size-4" />
        {backLabel}
      </Button>
    </div>
  );
}
