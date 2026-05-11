'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GetPhotosScreen } from '../components/GetPhotosScreen';
import { DoneScreen } from '../components/DoneScreen';

type ScreenType = 'get-photos' | 'done';

export function SessionEndPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  const [currentScreen, setCurrentScreen] = useState<ScreenType>('get-photos');

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  if (!sessionId) return null;

  const handleGetPhotosComplete = () => {
    setCurrentScreen('done');
  };

  const handleSessionEnd = () => {
    router.push('/');
  };

  return (
    <>
      {currentScreen === 'get-photos' && (
        <GetPhotosScreen
          onComplete={handleGetPhotosComplete}
          sessionId={sessionId}
        />
      )}
      {currentScreen === 'done' && (
        <DoneScreen onSessionEnd={handleSessionEnd} />
      )}
    </>
  );
}
