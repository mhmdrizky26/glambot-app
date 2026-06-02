'use client';

import * as React from 'react';
import { Camera } from 'lucide-react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import { Switch } from '@/components/admin/ui/switch';

export function CameraSettingsCard() {
  const [statusActive, setStatusActive] = React.useState(true);
  const [cameraName, setCameraName] = React.useState('Glambot Camera');
  const isConnected = true;

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
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        className="border-[#007DFC] text-[#007DFC] hover:bg-[#007DFC]/10 hover:text-[#007DFC] gap-2 rounded-[8px]"
      >
        <Camera className="size-4" />
        Test Camera
      </Button>
    </div>
  );
}
