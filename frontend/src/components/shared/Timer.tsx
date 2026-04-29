'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TimerProps {
  duration?: number;
  onTimeUp?: () => void;
}

export default function Timer({ duration = 120, onTimeUp }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const router = useRouter();

  useEffect(() => {
    if (timeLeft <= 0) {
      if (onTimeUp) {
        onTimeUp();
      } else {
        router.push('/');
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, router, onTimeUp]);

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
