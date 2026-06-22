'use client';

import { ArrowRight } from 'lucide-react';

interface EndSessionButtonProps {
  onEnd: () => void;
  /** True saat proses akhir sesi sedang berjalan (menunggu jepretan terakhir). */
  ending: boolean;
}

/**
 * Tombol "Selesai sekarang" untuk mempercepat alur: melewati sisa timer sesi.
 * Tidak memutus jepretan yang sedang berjalan — saat robot masih sibuk, tombol
 * berubah jadi status "Menyelesaikan foto…" dan transisi otomatis setelah selesai
 * (memakai logika grace-period yang sudah ada di PhotoSessionPage).
 */
export default function EndSessionButton({
  onEnd,
  ending,
}: EndSessionButtonProps) {
  return (
    <button
      type="button"
      onClick={onEnd}
      disabled={ending}
      aria-label="Selesai sekarang"
      className="flex items-center gap-2 rounded-full border border-white/60 bg-primary/70 px-5 py-2.5 text-white shadow-[0px_4px_16px_0px_rgba(17,45,78,0.4)] backdrop-blur-md transition-colors hover:bg-[#3F72AF]/60 active:bg-[#3F72AF] disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="text-sm font-semibold">
        {ending ? 'Menyelesaikan foto…' : 'Selesai sekarang'}
      </span>
      {!ending && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}
