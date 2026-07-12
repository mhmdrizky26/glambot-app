'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { playBackendAudio } from '@/lib/audio';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-full">
      <p className="text-primary text-[24px] tracking-[9px]">Experience The</p>

      <h1 className="mt-4 font-changa text-[140px] leading-none font-black gradient-text select-none">
        GLAMBOT
      </h1>

      <p className="mt-2 text-[#2b4260] text-[24px] font-medium tracking-[3px]">
        Control the camera with your gestures
      </p>

      <Button
        asChild
        size="lg"
        className="mt-20 w-88.5 h-30 rounded-[60px] animate-pulse-glow"
      >
        {/* Sapaan diputar saat tap — interaksi user ini sekaligus meng-"unlock"
            autoplay browser untuk suara di halaman berikutnya. */}
        <Link
          href="/package"
          onClick={() => playBackendAudio('selamatDatang.mp3')}
        >
          Tap to Start
        </Link>
      </Button>
    </main>
  );
}
