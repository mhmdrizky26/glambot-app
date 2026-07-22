'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { playBackendAudio } from '@/lib/audio';
import { resolveRobotUrl } from '@/lib/api-client';

// Cadence ulang ajakan "mulai" (ms).
const LOOP_INTERVAL_MS = 5_000;
// Seberapa sering cek presence ke robot (ms). Presence tak perlu serapat gesture.
const PRESENCE_POLL_MS = 1_000;

export default function Home() {
  const router = useRouter();

  // Ajakan "mulai" hanya berbunyi saat ADA gerakan di depan kamera gesture
  // (endpoint /presence robot), supaya ruangan kosong tidak berisik. Ruangan
  // kosong → tidak ada yang diputar (diam). Ada orang → putar tiap 5s; putaran
  // PERTAMA langsung berbunyi karena lastPlay awal 0 (sudah lewat interval).
  // Throttle ini juga bikin aman dari spam saat orang keluar-masuk cepat atau
  // robot flapping. Play bisa kena autoplay block browser sampai ada interaksi —
  // playBackendAudio menelan error itu diam-diam.
  //
  // Fail-safe: kalau robot tak terjangkau (proses mati / jaringan putus), jatuh
  // ke perilaku lama (loop terus) supaya kiosk tidak malah BISU karena gangguan.
  useEffect(() => {
    const robotUrl = resolveRobotUrl();
    let cancelled = false;
    let busy = false;
    let lastPlay = 0;

    const play = () => {
      playBackendAudio('mulaiNew.mp3');
      lastPlay = Date.now();
    };
    const playThrottled = () => {
      if (Date.now() - lastPlay >= LOOP_INTERVAL_MS) play();
    };

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`${robotUrl}/presence`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { present?: boolean };
        if (cancelled) return;
        // Ada gerakan → putar (throttle 5s). Kosong → diam, tak ada yang diputar.
        if (data.present) playThrottled();
      } catch {
        // Robot tak terjangkau → fallback ke loop terus (perilaku lama).
        if (cancelled) return;
        playThrottled();
      } finally {
        busy = false;
      }
    };

    tick();
    const id = window.setInterval(tick, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Sentuh di mana pun pada halaman → lanjut ke /package. Sapaan diputar saat
  // tap — interaksi user ini sekaligus meng-"unlock" autoplay browser untuk
  // suara di halaman berikutnya.
  const handleStart = () => {
    playBackendAudio('selamatDatang.mp3');
    router.push('/package');
  };

  return (
    <main
      onClick={handleStart}
      className="flex flex-col items-center justify-center min-h-full cursor-pointer select-none"
    >
      <div className="flex flex-col items-center animate-float-y">
        <p className="text-primary text-[34px] tracking-[13px]">Experience The</p>

        <h1 className="mt-5 font-changa text-[210px] leading-[0.9] font-black gradient-text">
          GLAMBOT
        </h1>

        <p className="mt-5 text-[#2b4260] text-[32px] font-medium tracking-[4px]">
          Control the camera with your gestures
        </p>
      </div>

      {/* Target sentuh menggantikan tombol "Tap to Start": cincin riak yang
          memuai keluar dari titik inti. Seluruh halaman tetap bisa di-tap, ini
          murni petunjuk visual (pointer-events-none). */}
      <div className="mt-10 flex flex-col items-center gap-6 pointer-events-none">
        <div className="relative flex items-center justify-center w-44 h-44">
          {/* Cincin riak berlapis — delay berbeda supaya mengalir terus. */}
          {[0, 0.8, 1.6].map((delay) => (
            <span
              key={delay}
              className="absolute inset-0 rounded-full border-4 border-primary/40 animate-tap-ring"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}

          {/* Titik inti yang berdenyut halus. */}
          <div className="w-18 h-18 rounded-full gradient-primary shadow-[0_0_40px_10px_rgba(17,45,78,0.25)] animate-pulse-glow" />
        </div>

        <p className="text-primary text-[34px] font-semibold tracking-[6px] animate-soft-glow">
          TAP ANYWHERE TO START
        </p>
      </div>
    </main>
  );
}
