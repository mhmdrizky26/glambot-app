'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { instructionSteps } from '../data/steps';
import {
  GetReadyCard,
  SafetyRulesCard,
  GestureControlsCard,
} from '../components/InstructionCards';
import { usePatchSessionStatus, useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '@/features/public/photo-session/lib/broadcastChannel';
import { playBackendAudio } from '@/lib/audio';
import Timer from '@/components/shared/Timer';
import { useAppConfig } from '@/shared/api/config';

export default function InstructionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();
  const touchStartX = useRef(0);
  const searchParams = useSearchParams();

  const sessionId = searchParams.get('sessionId') ?? '';
  const step = instructionSteps[currentStep];
  const isLast = currentStep === instructionSteps.length - 1;

  const { mutate } = usePatchSessionStatus();
  const { data: appConfig } = useAppConfig();
  const { data: session, isFetching: isSessionFetching } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  // Semua hook harus dipanggil tanpa syarat (rules-of-hooks); early-return
  // untuk sessionId kosong ditangani SETELAH semua hook dideklarasikan.
  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  // Guard: sesi yang belum dibayar / kedaluwarsa tidak boleh masuk instruksi.
  // PENTING: tunggu data FRESH — jangan bertindak saat masih fetching, karena
  // cache `['session', id]` bisa berisi 'pending_payment' lama tepat setelah
  // bayar (status 'paid' belum sempat ter-refetch) → kalau tidak, user yang
  // baru bayar malah ke-redirect balik ke /package. Backend tetap menolak
  // transisi ke 'shooting' tanpa 'paid' sebagai batas keamanan sebenarnya.
  useEffect(() => {
    if (isSessionFetching) return;
    if (session?.status === 'pending_payment' || session?.status === 'expired') {
      router.replace('/package');
    }
  }, [session?.status, isSessionFetching, router]);

  // Play preset.mp3 saat masuk step gesture-controls
  useEffect(() => {
    if (step?.type === 'gesture-controls') {
      playBackendAudio('preset.mp3');
    }
  }, [step?.type]);

  if (!sessionId) return null;

  const goToPhotoSession = () => {
    mutate({ sessionId, status: 'shooting' });

    // Broadcast SESSION_START ke Monitor 2 yang sudah standby
    sendSessionBroadcast({ type: 'SESSION_START', sessionId });

    // Robot di-enable di PhotoSessionPage (saat halaman kamera benar-benar
    // tampil), bukan di sini — supaya robot tidak bergerak selagi user masih
    // di layar instruksi.
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
      {/* Auto-advance ke photo session (durasi diatur admin; default 60s).
          Dirender setelah config termuat agar durasi pasti benar. */}
      {appConfig && (
        <Timer
          duration={appConfig.instructionTimeoutSecs}
          onTimeUp={goToPhotoSession}
        />
      )}

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
