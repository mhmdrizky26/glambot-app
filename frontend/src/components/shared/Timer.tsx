'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TimerProps {
  duration?: number;
  onTimeUp?: () => void;
}

export default function Timer({ duration = 120, onTimeUp }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const router = useRouter();
  // Pastikan onTimeUp / fallback router.push hanya fire SEKALI walaupun
  // efek re-run akibat onTimeUp ref berubah saat parent re-render (misal
  // karena mutation pending yang trigger render baru).
  const firedRef = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (timeLeft <= 0) {
      if (firedRef.current) return;
      firedRef.current = true;
      if (onTimeUpRef.current) {
        onTimeUpRef.current();
      } else {
        router.push('/');
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, router]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed p-8 top-4 right-4 z-50">
      <div className="text-primary text-[40px] font-bold">
        {formatTime(timeLeft)}
      </div>
    </div>
  );
}
