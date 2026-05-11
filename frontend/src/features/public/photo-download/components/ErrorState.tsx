'use client';

import GlassCard from '@/components/shared/GlassCard';
import { StatusAnimation } from '@/components/shared/StatusAnimation';

interface ErrorStateProps {
  onRetry: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="w-full flex items-center justify-center px-4">
      <GlassCard
        variant="default"
        className="flex flex-col items-center text-center px-8 py-10 gap-4"
      >
        <StatusAnimation status="failed" />
        <h1 className="text-2xl font-bold text-primary">Gagal memuat foto</h1>
        <p className="text-primary/60 text-base leading-relaxed">
          Terjadi kesalahan saat mengambil foto. Periksa koneksi internet Anda
          dan coba lagi.
        </p>
        <button
          onClick={onRetry}
          className="mt-2 min-h-11 min-w-11 px-6 rounded-xl bg-white/20 border border-white/40 text-primary font-semibold text-base hover:bg-white/30 active:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Coba lagi memuat foto"
        >
          Coba Lagi
        </button>
      </GlassCard>
    </div>
  );
}
