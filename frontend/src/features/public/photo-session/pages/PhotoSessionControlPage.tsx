'use client';

import { Gestures } from '../data/gestures';
import { GestureDetectionPanel } from '../components/GestureDetectionPanel';
import { GestureControlsGrid } from '../components/GestureControlsGrid';
import { useState, useEffect } from 'react';
import { useGetSession } from '@/shared/api/session';
import { listenSessionBroadcast } from '../lib/broadcastChannel';
import {
  useRobotDetection,
  GESTURE_ID_TO_GRID_INDEX,
} from '../api/getRobotDetection';

/**
 * Monitor 2 — Gesture Controls
 *
 * Selalu terbuka di monitor kedua dalam mode standby.
 * Aktif saat menerima SESSION_START broadcast → tampilkan gesture UI yang
 * disambungkan langsung ke dobot robot service (:5001): liveview kamera deteksi
 * tangan (MJPEG /video_feed), gesture yang terdeteksi, dan state lock/unlock
 * beserta progress-nya (poll /detection). Kembali standby saat SESSION_END.
 */
export function PhotoSessionControlPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  // State real-time dari dobot. Poll hanya saat sesi aktif.
  const { detection, reachable, streamUrl } = useRobotDetection({
    enabled: isActive,
  });

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
      },
    });

    return unsubscribe;
  }, [sessionId]);

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

  // ── Derive dari detection real ──────────────────────────────────────────────
  const fsmState = detection?.fsm_state ?? 'LOCKED';
  const armPercent = detection?.recognition_progress?.arm?.percent ?? 0;
  const presetPercent = detection?.recognition_progress?.preset?.percent ?? 0;

  const handDetected = !!detection?.hand_detected;
  const gestureId = handDetected ? detection?.gesture_id ?? null : null;
  const gestureName = handDetected ? detection?.gesture_name ?? null : null;
  const activePresetName = detection?.robot_preset ?? null;

  // Highlight gesture yang sedang terdeteksi di grid.
  const activeGestureIndex =
    gestureId != null ? GESTURE_ID_TO_GRID_INDEX[gestureId] ?? null : null;

  // ── Active UI ───────────────────────────────────────────────────────────────
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
              streamUrl={streamUrl}
              reachable={reachable}
              fsmState={fsmState}
              armPercent={armPercent}
              presetPercent={presetPercent}
              gestureName={gestureName}
              activePresetName={activePresetName}
            />
          </div>
        </div>

        {/* Right — Gesture Controls (read-only, refleksi gesture terdeteksi) */}
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <h2 className="text-primary font-medium text-[32px] tracking-[1.13px] shrink-0">
            Gesture
          </h2>
          <div className="w-76.25">
            <GestureControlsGrid
              gestures={Gestures}
              activeGestureIndex={activeGestureIndex}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
