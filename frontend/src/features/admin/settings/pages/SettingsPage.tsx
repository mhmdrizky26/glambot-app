'use client';

import * as React from 'react';
import { PrinterSettingsCard } from '../components/PrinterSettingsCard';
import { CameraSettingsCard } from '../components/CameraSettingsCard';
import { NotificationSettingsCard } from '../components/NotificationSettingsCard';
import { SystemInformationCard } from '../components/SystemInformationCard';
import { BackupRestoreCard } from '../components/BackupRestoreCard';

export function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
          Settings
        </h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Manage application settings and glambot system.
        </p>
      </div>

      {/* Top row: 3 cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PrinterSettingsCard />
        <CameraSettingsCard />
        <NotificationSettingsCard />
      </div>

      {/* Bottom row: 2 cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SystemInformationCard />
        <BackupRestoreCard />
      </div>
    </div>
  );
}
