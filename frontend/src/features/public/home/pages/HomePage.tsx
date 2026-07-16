'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { playBackendAudio } from '@/lib/audio';

export default function Home() {
  const router = useRouter();

  // Ajakan "mulai" diputar berulang tiap 10 detik selama di halaman start
  // supaya menarik perhatian pengunjung. Play pertama bisa kena autoplay block
  // browser (belum ada interaksi) — playBackendAudio menelan error itu diam-diam,
  // dan putaran berikutnya jalan begitu autoplay ter-unlock oleh interaksi apa pun.
  useEffect(() => {
    playBackendAudio('mulai.mp3');
    const id = window.setInterval(() => playBackendAudio('mulai.mp3'), 10_000);
    return () => window.clearInterval(id);
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
      className="flex flex-col items-center justify-center min-h-full cursor-pointer"
    >
      <p className="text-primary text-[24px] tracking-[9px]">Experience The</p>

      <h1 className="mt-4 font-changa text-[140px] leading-none font-black gradient-text select-none">
        GLAMBOT
      </h1>

      <p className="mt-2 text-[#2b4260] text-[24px] font-medium tracking-[3px]">
        Control the camera with your gestures
      </p>

      <Button
        size="lg"
        className="mt-20 w-88.5 h-30 rounded-[60px] animate-pulse-glow pointer-events-none"
      >
        Tap to Start
      </Button>
    </main>
  );
}
