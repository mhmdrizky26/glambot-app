'use client';

import { Gestures } from '../data/gestures';
import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import { GestureDetectionPanel } from '../components/GestureDetectionPanel';
import { GestureControlsGrid } from '../components/GestureControlsGrid';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  const [activeGestureIndex, setActiveGestureIndex] = useState<number | null>(
    null,
  );
  const [gestureState, setGestureState] = useState<
    'waiting' | 'locked' | 'ended'
  >('waiting');
  const [lockTimeLeft, setLockTimeLeft] = useState(0);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(600); // 10 menit

  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const detectionVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (mainVideoRef.current) {
          mainVideoRef.current.srcObject = stream;
        }
        if (detectionVideoRef.current) {
          detectionVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to access camera:', err);
      }
    }

    if (sessionId) {
      initCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (sessionTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setSessionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionTimeLeft]);

  const handleTriggerGesture = (index: number) => {
    if (index === 9) {
      // Unlock gesture
      setGestureState('waiting');
      setActiveGestureIndex(null);
      setLockTimeLeft(0);
    } else {
      setGestureState('locked');
      setActiveGestureIndex(index);
      setLockTimeLeft(15);

      const timer = setInterval(() => {
        setLockTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setGestureState('waiting');
            setActiveGestureIndex(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  if (!sessionId) {
    return null;
  }

  const activeGestureName =
    activeGestureIndex !== null
      ? Gestures[activeGestureIndex]?.name
      : undefined;

  return (
    <div className="min-h-screen flex flex-col overflow-hidden">
      <div className="p-6">
        <SessionHeader sessionTimeLeft={sessionTimeLeft} />
      </div>

      <main className="flex-1 flex flex-row gap-4 px-6 pb-6 pt-4">
        <div className="flex-1 flex flex-col gap-2 max-h-145">
          <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
            Preview Camera
          </h2>
          <div className="flex-1 min-h-0">
            <CameraPreview videoRef={mainVideoRef} />
          </div>
        </div>

        <div className="w-105 shrink-0 flex flex-col gap-3 max-h-145">
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
              Gesture Detection
            </h2>
            <GestureDetectionPanel
              videoRef={detectionVideoRef}
              gestureState={gestureState}
              activeName={activeGestureName}
              lockTimeLeft={lockTimeLeft}
              maxLockTime={15}
            />
          </div>

          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
              Gesture Controls
            </h2>
            <GestureControlsGrid
              gestures={Gestures}
              activeGestureIndex={activeGestureIndex}
              onTrigger={handleTriggerGesture}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
