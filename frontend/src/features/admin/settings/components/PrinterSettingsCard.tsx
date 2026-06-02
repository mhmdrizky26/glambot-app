'use client';

import * as React from 'react';
import { Printer } from 'lucide-react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import { Switch } from '@/components/admin/ui/switch';

export function PrinterSettingsCard() {
  const [statusActive, setStatusActive] = React.useState(true);
  const [autoPrint, setAutoPrint] = React.useState(true);
  const [printerName, setPrinterName] = React.useState('Glambot Printer');

  return (
    <div className="bg-card flex flex-col gap-5 rounded-xl border p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-[#007DFC]/15 flex size-10 items-center justify-center rounded-lg">
          <Printer className="size-5 text-[#007DFC]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Printer Photo</h3>
          <p className="text-muted-foreground text-xs">Manage printer photo</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status Printer</span>
            {statusActive && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80"
              >
                Active
              </Badge>
            )}
          </div>
          <Switch checked={statusActive} onCheckedChange={setStatusActive} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="printer-name" className="text-sm font-medium">
            Printer Name
          </Label>
          <Input
            id="printer-name"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            placeholder="Glambot Printer"
            className="h-9 rounded-[8px] text-sm"
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Auto Print</span>
            <span className="text-muted-foreground text-xs">
              Automatically print after session is finished.
            </span>
          </div>
          <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
        </div>
      </div>

      <Button
        variant="outline"
        className="border-[#007DFC] text-[#007DFC] hover:bg-[#007DFC]/10 hover:text-[#007DFC] gap-2 rounded-[8px]"
      >
        <Printer className="size-4" />
        Test Print
      </Button>
    </div>
  );
}
