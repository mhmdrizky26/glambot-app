import React from 'react';
import { Monitor } from 'lucide-react';
import { Badge } from '@/components/admin/ui/badge';

interface InfoRow {
  label: string;
  value: React.ReactNode;
}

const INFO: InfoRow[] = [
  { label: 'App Version', value: 'v1.2.3' },
  { label: 'Build', value: '27 May 2027' },
  {
    label: 'Server',
    value: (
      <Badge
        variant="secondary"
        className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80"
      >
        Online
      </Badge>
    ),
  },
  { label: 'Last Updated', value: '28 May 2027' },
];

export function SystemInformationCard() {
  return (
    <div className="bg-card flex flex-col gap-5 rounded-xl border p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="bg-[#007DFC]/15 flex size-10 items-center justify-center rounded-lg">
          <Monitor className="size-5 text-[#007DFC]" />
        </div>
        <div>
          <h3 className="text-base font-semibold">System Information</h3>
          <p className="text-muted-foreground text-xs">
            Technical information of systems and applications.
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        {INFO.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-3 py-3 ${
              i > 0 ? 'border-t' : ''
            }`}
          >
            <span className="text-muted-foreground text-sm">{row.label}</span>
            <span className="text-sm font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
