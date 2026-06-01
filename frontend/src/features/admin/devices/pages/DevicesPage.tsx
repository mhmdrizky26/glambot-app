'use client';

import * as React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { CameraCard, type CameraInfo } from '../components/CameraCard';
import { PrinterCard, type PrinterInfo } from '../components/PrinterCard';
import { RobotCard, type RobotInfo } from '../components/RobotCard';

const DUMMY_CAMERA: CameraInfo = {
  id: 'CAM-001',
  resolution: '1920x1080',
  status: 'Active',
  lastActive: '27 May 2026, 13:24',
  activeDuration: '4j 12m',
  isOnline: true,
};

const DUMMY_PRINTER: PrinterInfo = {
  id: 'PRT-001',
  resolution: '300 DPI',
  status: 'Active',
  lastActive: '27 May 2026, 13:18',
  activeDuration: '3j 48m',
  totalPrint: 1248,
  isOnline: true,
  paperRemaining: 320,
  paperTotal: 500,
  ribbonRemaining: 72,
  paperSize: '4R (4x6 inch)',
  paperType: 'Glossy',
  isReady: true,
};

const DUMMY_ROBOT: RobotInfo = {
  id: 'RBT-001',
  status: 'Active',
  lastActive: '27 May 2026, 13:22',
  activeDuration: '4j 03m',
  isOnline: true,
};

const formatTimestamp = (date: Date) =>
  date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function DevicesPage() {
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  React.useEffect(() => {
    // Set initial timestamp client-side to avoid SSR hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastUpdated(new Date());
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate refresh — replace with real fetch when API is ready
    setTimeout(() => {
      setLastUpdated(new Date());
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Device Monitoring
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor camera, printer, and robot status <br /> in real time
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh"
              className="rounded-[8px]"
            >
              <RefreshCwIcon
                className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </Button>
            <span className="text-sm font-medium">Refresh</span>
          </div>
          <span className="text-muted-foreground text-xs">
            {lastUpdated
              ? `Terakhir diperbarui ${formatTimestamp(lastUpdated)}`
              : 'Belum pernah diperbarui'}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <CameraCard data={DUMMY_CAMERA} />
        <PrinterCard data={DUMMY_PRINTER} />
        <RobotCard data={DUMMY_ROBOT} />
      </div>
    </div>
  );
}
