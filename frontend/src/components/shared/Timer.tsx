'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePersistedCountdown } from '@/lib/usePersistedCountdown';
import { formatTimeMMSS } from '@/lib/formatTime';

interface TimerProps {
  duration?: number;
  onTimeUp?: () => void;
  // Opsional: kalau di-pass, sisa waktu disimpan di sessionStorage dan
  // refresh halaman tetap melanjutkan hitungan (bukan reset ke `duration`).
  // Biasanya sertakan sessionId di key supaya tidak bocor antar sesi.
  storageKey?: string | null;
}

export default function Timer({
  duration = 120,
  onTimeUp,
  storageKey = null,
}: TimerProps) {
  const { timeLeft, clear } = usePersistedCountdown(storageKey, duration);
  const router = useRouter();
  // Pastikan onTimeUp / fallback router.push hanya fire SEKALI walaupun
  // efek re-run akibat onTimeUp ref berubah saat parent re-render (misal
  // karena mutation pending yang trigger render baru).
  const firedRef = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  // Sinkronkan ref setelah render (bukan saat render) — dibaca di effect di bawah.
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (timeLeft > 0) return;
    if (firedRef.current) return;
    firedRef.current = true;
    clear();
    if (onTimeUpRef.current) {
      onTimeUpRef.current();
    } else {
      router.push('/');
    }
  }, [timeLeft, router, clear]);

  return (
    <div className="fixed p-8 top-4 right-4 z-50 pointer-events-none">
      <div className="text-primary text-[40px] font-bold">
        {formatTimeMMSS(timeLeft)}
      </div>
    </div>
  );
}
