'use client';

import { instructionSteps } from '@/features/public/instruction/data/steps';

// Reuse daftar gesture yang sama dengan halaman Instruction (sumber tunggal),
// jadi preset 1–10 + ikon + kombinasi jari selalu konsisten.
const gestures =
  instructionSteps.find((s) => s.type === 'gesture-controls')?.gestures ?? [];

/**
 * Panduan gesture preset 1–10, ditampilkan sebagai bar ringkas di bawah preview
 * kamera. Referensi statis (bukan indikator real-time) — di PhotoSessionPage
 * bar ini disembunyikan saat sebuah preset sedang terdeteksi agar layar bersih.
 */
export default function GestureGuide() {
  return (
    // Tanpa background — ikon "melayang" di atas preview. drop-shadow menjaga
    // ikon tetap terbaca di atas latar kamera yang berubah-ubah.
    <div className="flex items-center justify-between gap-2">
      {gestures.map((g, i) => (
        <div key={`${g.name}-${i}`} className="flex flex-1 justify-center">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.icon}
              alt={g.name}
              className="h-12 w-12 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
            />
            {/* Nomor preset (1–10) — bedakan dua "Stop" (preset 5 & 10). */}
            <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#3F72AF] text-[11px] font-bold text-white shadow-md ring-2 ring-white/70">
              {i + 1}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
