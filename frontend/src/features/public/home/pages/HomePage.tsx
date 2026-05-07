import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-full">
      <p className="text-primary text-[24px] tracking-[9px]">Experience The</p>

      <h1 className="mt-4 font-changa text-[140px] leading-none font-black gradient-text select-none">
        GLAMBOT
      </h1>

      <p className="mt-2 text-[#2b4260] text-base font-medium tracking-[2.5px]">
        Control the camera with your gestures
      </p>

      <Button asChild size="lg" className="mt-20 w-88.5 h-30">
        <Link href="/package">Tap to Start</Link>
      </Button>
    </main>
  );
}
