'use client';

import GlassCard from '@/components/shared/GlassCard';
import { StatusAnimation } from '@/components/shared/StatusAnimation';

export function ExpiredState() {
  return (
    <div className="w-full flex items-center justify-center px-4">
      <GlassCard
        variant="default"
        className="flex flex-col items-center text-center px-8 py-10 gap-4"
      >
        <StatusAnimation status="expired" />
        <h1 className="text-2xl font-bold text-primary">
          Link ini sudah tidak aktif
        </h1>
        <p className="text-primary/60 text-base leading-relaxed">
          Link download foto hanya aktif selama 2 hari setelah sesi selesai.
        </p>
      </GlassCard>
    </div>
  );
}
