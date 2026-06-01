'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/admin/ui/switch';

interface NotificationOption {
  key: string;
  title: string;
  description: string;
  defaultEnabled: boolean;
}

const NOTIFICATIONS: NotificationOption[] = [
  {
    key: 'email',
    title: 'Email Notification',
    description: 'Receive notifications via email.',
    defaultEnabled: true,
  },
  {
    key: 'transaction',
    title: 'Transaction Notification',
    description: 'Notify on every successful transaction.',
    defaultEnabled: true,
  },
  {
    key: 'error',
    title: 'Error Notification',
    description: 'Alert when system errors occur.',
    defaultEnabled: true,
  },
  {
    key: 'daily',
    title: 'Daily Summary',
    description: 'Daily activity summary delivered every morning.',
    defaultEnabled: true,
  },
];

export function NotificationSettingsCard() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() =>
    NOTIFICATIONS.reduce<Record<string, boolean>>((acc, n) => {
      acc[n.key] = n.defaultEnabled;
      return acc;
    }, {}),
  );

  return (
    <div className="bg-card flex flex-col gap-5 rounded-xl border p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-[#8A38F5]/15 flex size-10 items-center justify-center rounded-lg">
          <Bell className="size-5 text-[#8A38F5]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Notification</h3>
          <p className="text-muted-foreground text-xs">
            Manage system notification
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        {NOTIFICATIONS.map((n, i) => (
          <div
            key={n.key}
            className={`flex items-start justify-between gap-3 py-3 ${
              i > 0 ? 'border-t' : ''
            }`}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{n.title}</span>
              <span className="text-muted-foreground text-xs">
                {n.description}
              </span>
            </div>
            <Switch
              checked={enabled[n.key]}
              onCheckedChange={(v) =>
                setEnabled((prev) => ({ ...prev, [n.key]: v }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
