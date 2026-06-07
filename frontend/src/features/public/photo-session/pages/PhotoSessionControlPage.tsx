'use client';

import { Gestures } from '../data/gestures';
import { GestureDetectionPanel } from '../components/GestureDetectionPanel';
import { GestureControlsGrid } from '../components/GestureControlsGrid';
import { useState, useRef, useEffect } from 'react';
import { useGetSession } from '@/shared/api/session';
import { listenSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';

/**
 * Monitor 2 — Gesture Controls
 *
 * Selalu terbuka di monitor kedua dalam mode standby.
 * Aktif saat menerima SESSION_START broadcast → tampilkan gesture UI.
 * Kembali standby saat menerima SESSION_END broadcast.
 */
export function PhotoSessionControlPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const [activeGestureIndex, setActiveGestureIndex] = useState<number | null>(
    null,
  );
  const [gestureState, setGestureState] = useState<
    'waiting' | 'locked' | 'ended'
  >('waiting');
  const [lockTimeLeft, setLockTimeLeft] = useState(0);

  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { frameUrl } = useLiveStream();

  useGetSession({
    sessionId: sessionId ?? '',
    queryConfig: { enabled: !!sessionId },
  });

  // Listen broadcast dari Monitor 1
  useEffect(() => {
    const unsubscribe = listenSessionBroadcast({
      onStart: (id) => {
        setSessionId(id);
        setIsActive(true);
      },
      onEnd: (id) => {
        if (id !== sessionId) return;
        setIsActive(false);
        setSessionId(null);
        setActiveGestureIndex(null);
        setGestureState('waiting');
        setLockTimeLeft(0);
        if (lockTimerRef.current) {
          clearInterval(lockTimerRef.current);
          lockTimerRef.current = null;
        }
      },
    });

    return unsubscribe;
  }, [sessionId]);

  // Cleanup lock timer saat unmount
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, []);

  const handleTriggerGesture = (index: number) => {
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    if (index === 9) {
      setGestureState('waiting');
      setActiveGestureIndex(null);
      setLockTimeLeft(0);
    } else {
      setGestureState('locked');
      setActiveGestureIndex(index);
      setLockTimeLeft(15);

      lockTimerRef.current = setInterval(() => {
        setLockTimeLeft((prev) => {
          const next = prev <= 1 ? 0 : prev - 1;
          if (next === 0) {
            clearInterval(lockTimerRef.current!);
            lockTimerRef.current = null;
            setGestureState('waiting');
            setActiveGestureIndex(null);
          }
          return next;
        });
      }, 1000);
    }
  };

  // ── Standby UI ──────────────────────────────────────────────────────────────
  if (!isActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-primary/40 text-2xl font-medium tracking-widest uppercase">
          Standby
        </p>
        <p className="text-white/20 text-sm">Waiting for next session...</p>
      </div>
    );
  }

  // ── Active UI ───────────────────────────────────────────────────────────────
  const activeGestureName =
    activeGestureIndex !== null
      ? Gestures[activeGestureIndex]?.name
      : undefined;

  return (
    <div className="min-h-full flex flex-col overflow-hidden px-[79.7px] pb-[190.19px] pt-[120.16px] gap-6">
      <div className="flex flex-row gap-6 flex-1 min-h-0">
        {/* Left — Gesture Detection */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <h2 className="text-primary font-medium text-[32px] tracking-[1.13px] shrink-0">
            Gesture Detection
          </h2>
          <div className="w-[875.31px] h-160.25">
            <GestureDetectionPanel
              streamUrl={frameUrl}
              gestureState={gestureState}
              activeName={activeGestureName}
              lockTimeLeft={lockTimeLeft}
              maxLockTime={15}
            />
          </div>
        </div>

        {/* Right — Gesture Controls */}
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <h2 className="text-primary font-medium text-[32px] tracking-[1.13px] shrink-0">
            Gesture
          </h2>
          <div className="w-76.25">
            <GestureControlsGrid
              gestures={Gestures}
              activeGestureIndex={activeGestureIndex}
              onTrigger={handleTriggerGesture}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
