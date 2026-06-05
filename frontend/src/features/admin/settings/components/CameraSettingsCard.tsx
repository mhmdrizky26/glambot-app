'use client';

import * as React from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import { useGetDevices } from '@/features/admin/devices/api/getDevices';

export function CameraSettingsCard() {
  // Status kamera diambil dari probe nyata yang sama dengan halaman Devices
  // (Canon-only via digiCamControl) — bukan nilai hardcode.
  const { data, isLoading, isFetching, refetch } = useGetDevices();
  const camera = data?.camera;
  const isConnected = camera?.isOnline ?? false;

  // Nama kamera diisi otomatis dari hasil deteksi, tapi tetap bisa diedit.
  const [cameraName, setCameraName] = React.useState('');
  React.useEffect(() => {
    if (camera?.id) setCameraName(camera.id);
  }, [camera?.id]);

  return (
    <div className="bg-card flex flex-col gap-5 rounded-xl border p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-[#12C964]/15 flex size-10 items-center justify-center rounded-lg">
          <Camera className="size-5 text-[#12C964]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Camera</h3>
          <p className="text-muted-foreground text-xs">Manage camera</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status Camera</span>
            {isLoading ? (
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            ) : (
              <Badge
                variant="secondary"
                className={
                  isConnected
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80'
                    : 'bg-rose-100 text-rose-800 hover:bg-rose-100/80'
                }
              >
                {isConnected ? 'Active' : 'Inactive'}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="camera-name" className="text-sm font-medium">
            Camera Name
          </Label>
          <Input
            id="camera-name"
            value={cameraName}
            onChange={(e) => setCameraName(e.target.value)}
            placeholder="Glambot Camera"
            className="h-9 rounded-[8px] text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Connection Status</span>
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                isConnected ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-sm font-medium">
              {isLoading
                ? 'Checking…'
                : isConnected
                  ? 'Connected'
                  : 'Disconnected'}
            </span>
          </div>
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
          <Camera className="size-4" />
        )}
        Test Camera
      </Button>
    </div>
  );
}
