'use client';

import React from 'react';
import { CloudIcon, DatabaseIcon, HistoryIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';

export function BackupRestoreCard() {
  return (
    <div className="bg-card flex flex-col gap-5 rounded-xl border p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-[#007DFC]/15 flex size-10 items-center justify-center rounded-lg">
          <CloudIcon className="size-5 text-[#007DFC]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Backup &amp; Restore</h3>
          <p className="text-muted-foreground text-xs">
            Manage system data backup manually
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
              <DatabaseIcon className="text-muted-foreground size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Backup Data</span>
              <span className="text-muted-foreground text-xs">
                Backup all system data to a backup file.
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-[#007DFC] text-[#007DFC] hover:bg-[#007DFC]/10 hover:text-[#007DFC] shrink-0 rounded-[8px]"
          >
            Backup Now
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
              <HistoryIcon className="text-muted-foreground size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Restore Data</span>
              <span className="text-muted-foreground text-xs">
                Restore system data from backup file.
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-[#007DFC] text-[#007DFC] hover:bg-[#007DFC]/10 hover:text-[#007DFC] shrink-0 rounded-[8px]"
          >
            Restore Data
          </Button>
        </div>
      </div>
    </div>
  );
}
