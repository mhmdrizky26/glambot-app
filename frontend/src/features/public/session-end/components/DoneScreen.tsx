'use client';

import Timer from '@/components/shared/Timer';
import { CloudDownload, Sparkles } from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '@/assets/loading.json';
import { useEffect, useState } from 'react';

interface DoneScreenProps {
  onSessionEnd: () => void;
  sessionId: string;
}
export function DoneScreen({ onSessionEnd, sessionId }: DoneScreenProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-full w-full flex flex-col items-center justify-center gap-4">
        <div className="w-37.5 h-37.5">
          <Lottie animationData={loadingAnimation} loop={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
      <Timer
        duration={30}
        onTimeUp={onSessionEnd}
        storageKey={`done-screen:${sessionId}`}
      />

      {/* Robot Icon */}
      <div className="mb-4">
        <img src="/robot 1.svg" alt="Robot" className="w-30" />
      </div>

      {/* Aligned content block */}
      <div className="flex flex-col items-start">
        {/* Thank You with sparkles */}
        <div className="relative mb-3">
          <Sparkles
            size={60}
            className="text-primary absolute -left-12 top-1"
            strokeWidth={1.5}
            fill="currentColor"
          />
          <h1 className="text-[128px] font-bold bg-linear-to-tl gradient-text ">
            Thank You!
          </h1>
        </div>

        {/* Subtitle + QR row */}
        <div className="flex items-start gap-6 mb-4">
          {/* Text */}
          <div className="flex flex-col">
            <p className="text-primary text-2xl font-medium leading-relaxed">
              Your photo is on its way to WhatsApp.
            </p>
            <p className="text-primary text-2xl font-medium leading-relaxed">
              See you in the next session!
            </p>
          </div>

          {/* QR Code — primary color */}
          <div className="flex  gap-4 shrink-0">
            <img
              src="/qr-d.svg"
              alt="Scan Feedback"
              className="w-17.5 h-17.5"
            />
            <span className="text-lg bg-linear-to-b gradient-text">
              Scan <br /> Feedback
            </span>
          </div>
        </div>

        <div className="flex  gap-2 bg-primary/8 border border-primary/15 px-4 py-2 rounded-full">
          <CloudDownload size={14} className="text-primary/50" />
          <span className="text-[12px] text-primary/60 font-medium">
            Website valid for 7 days
          </span>
        </div>
      </div>

      {/* Gdrive badge */}
    </div>
  );
}
