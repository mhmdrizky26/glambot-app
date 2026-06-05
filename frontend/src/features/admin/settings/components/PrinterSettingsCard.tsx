'use client';

import * as React from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import { Switch } from '@/components/admin/ui/switch';
import { useGetDevices } from '@/features/admin/devices/api/getDevices';

export function PrinterSettingsCard() {
  // Status printer diambil dari probe nyata yang sama dengan halaman Devices
  // (printer fisik OS; printer virtual PDF/XPS diabaikan) — bukan hardcode.
  const { data, isLoading, isFetching, refetch } = useGetDevices();
  const printer = data?.printer;
  const isOnline = printer?.isOnline ?? false;

  // Auto Print masih preferensi lokal (belum ada backend penyimpanannya).
  const [autoPrint, setAutoPrint] = React.useState(true);

  // Nama printer diisi otomatis dari hasil deteksi, tapi tetap bisa diedit.
  const [printerName, setPrinterName] = React.useState('');
  React.useEffect(() => {
    if (printer?.id && printer.id !== 'N/A') setPrinterName(printer.id);
  }, [printer?.id]);

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
            {isLoading ? (
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            ) : (
              <Badge
                variant="secondary"
                className={
                  isOnline
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80'
                    : 'bg-rose-100 text-rose-800 hover:bg-rose-100/80'
                }
              >
                {isOnline ? 'Active' : 'Offline'}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="printer-name" className="text-sm font-medium">
            Printer Name
          </Label>
          <Input
            id="printer-name"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            placeholder="Belum ada printer terdeteksi"
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
        onClick={() => refetch()}
        disabled={isFetching}
        className="border-[#007DFC] text-[#007DFC] hover:bg-[#007DFC]/10 hover:text-[#007DFC] gap-2 rounded-[8px]"
      >
        {isFetching ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Printer className="size-4" />
        )}
        Test Print
      </Button>
    </div>
  );
}
