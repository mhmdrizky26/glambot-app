'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { instructionSteps } from '../data/steps';
import {
  GetReadyCard,
  SafetyRulesCard,
  GestureControlsCard,
} from '../components/InstructionCards';
import { usePatchSessionStatus } from '@/shared/api/session';
import { sendSessionBroadcast } from '@/features/public/photo-session/lib/broadcastChannel';
import { apiClient } from '@/lib/api-client';
import { playBackendAudio } from '@/lib/audio';
import Timer from '@/components/shared/Timer';

export default function InstructionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();
  const touchStartX = useRef(0);
  const searchParams = useSearchParams();

  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  if (!sessionId) return null;

  const step = instructionSteps[currentStep];
  const isLast = currentStep === instructionSteps.length - 1;

  const { mutate } = usePatchSessionStatus();

  // Play preset.mp3 saat masuk step gesture-controls
  useEffect(() => {
    if (step?.type === 'gesture-controls') {
      playBackendAudio('preset.mp3');
    }
  }, [step?.type]);

  const goToPhotoSession = () => {
    // Robot enable saat user lanjut ke photo session (manual atau timeout)
    apiClient.post('/api/robot/enable').catch((err) => {
      console.warn('[Instruction] robot/enable failed:', err);
    });

    mutate({ sessionId, status: 'shooting' });

    // Broadcast SESSION_START ke Monitor 2 yang sudah standby
    sendSessionBroadcast({ type: 'SESSION_START', sessionId });

    router.push(`/photo-session?sessionId=${sessionId}`);
  };

  const handleNext = () => {
    if (isLast) {
      goToPhotoSession();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  // Swipe left/right to navigate between steps
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    const threshold = 50;

    if (diff > threshold && currentStep < instructionSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else if (diff < -threshold && currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <main
      className="flex flex-col items-center min-h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1 menit auto-advance ke photo session */}
      <Timer duration={60} onTimeUp={goToPhotoSession} />

      <div className="text-center py-3.5">
        <h1 className="font-bold text-primary text-[62px]">
          Intro & Safety Instruction
        </h1>
      </div>

      {/* Animate step transition on key change */}
      <div
        key={currentStep}
        className="flex justify-center w-full py-[73.6px] animate-[slideUp_300ms_ease-out]"
      >
        {step.type === 'get-ready' ? (
          <GetReadyCard step={step} onNext={handleNext} buttonLabel="Next →" />
        ) : step.type === 'safety' ? (
          <SafetyRulesCard
            step={step}
            onNext={handleNext}
            buttonLabel="Next →"
          />
        ) : (
          <GestureControlsCard
            step={step}
            onNext={handleNext}
            buttonLabel="Got it, Let's Go!"
          />
        )}
      </div>
    </main>
  );
}
