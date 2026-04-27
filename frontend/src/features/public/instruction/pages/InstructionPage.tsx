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

  const handleNext = () => {
    if (isLast) {
      mutate({ sessionId, status: 'shooting' });

      router.push(`/photo-session?sessionId=${sessionId}`);
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
      className="flex flex-col items-center min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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
