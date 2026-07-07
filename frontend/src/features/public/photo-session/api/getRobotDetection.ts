import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveRobotUrl } from '@/lib/api-client';

export type RobotFsmState =
  | 'LOCKED'
  | 'UNLOCKING'
  | 'UNLOCKED'
  | 'CONFIRMING'
  | 'MOVING'
  | 'COOLDOWN';

export interface RobotDetection {
  session_active: boolean;
  hand_detected: boolean;
  gesture_id: number | null;
  gesture_name: string | null;
  confidence: number | null;
  method: string;
  tracking: boolean;
  fsm_state: RobotFsmState;
  status: string;
  recognition_progress: {
    label: string;
    arm: { percent: number }; // progress safety-unlock (tahan open palm)
    preset: { percent: number }; // progress pengenalan gesture preset
  };
  robot_preset: string | null;
  robot: {
    connected: boolean;
    enabled: boolean;
    current_preset: number | null;
    ip: string;
  };
}

/**
 * Peta gesture_id dobot (1-10, berdasarkan pola jari) → index di grid Gestures[]
 * frontend (lihat data/gestures.ts). Urutan grid berbeda dari urutan id dobot,
 * jadi dipetakan by pola jari agar highlight-nya benar.
 */
export const GESTURE_ID_TO_GRID_INDEX: Record<number, number> = {
  1: 0, // Index                         → Move Up
  2: 2, // Index + Middle                → Move Forward
  3: 4, // Index + Middle + Ring         → Move Right
  4: 6, // Index + Middle + Ring + Pinky → Move Down
  5: 7, // All Fingers (open hand)       → Stop
  6: 1, // Thumb                         → Move Left
  7: 3, // Thumb + Index                 → Move Backward
  8: 5, // Thumb + Index + Middle        → Rotate CW
  9: 8, // Thumb + Index + Middle + Ring → Rotate CCW
  10: 9, // Fist                         → Stop (fist)
};

const POLL_MS = 150;

interface UseRobotDetectionOptions {
  enabled?: boolean;
}

/**
 * Polling endpoint /detection dobot (Flask :5001) untuk state real-time:
 * gesture terdeteksi, fsm lock/unlock, dan progress bar. Juga menyediakan URL
 * stream MJPEG (/video_feed) untuk liveview kamera deteksi tangan.
 */
export function useRobotDetection({ enabled = true }: UseRobotDetectionOptions = {}) {
  const robotUrl = useMemo(() => resolveRobotUrl(), []);
  const [detection, setDetection] = useState<RobotDetection | null>(null);
  const [reachable, setReachable] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setDetection(null);
      setReachable(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await fetch(`${robotUrl}/detection`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RobotDetection;
        if (!active) return;
        setDetection(data);
        setReachable(true);
      } catch {
        if (!active) return;
        setReachable(false);
      } finally {
        busyRef.current = false;
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      clearInterval(id);
      controller.abort();
    };
  }, [enabled, robotUrl]);

  const streamUrl = enabled ? `${robotUrl}/video_feed` : null;

  return { detection, reachable, robotUrl, streamUrl };
}
